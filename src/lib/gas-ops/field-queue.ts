/**
 * Очередь отправки бригадира (ADR-056, 2; инвариант 7). Без сети запись лежит на телефоне
 * с ключом отправки и подписана «Сохранено на телефоне». При сети уходит на сервер; ответ
 * сервера переводит её в «Принято сервером». Повтор с тем же ключом дубля не создаёт —
 * это правило порта, очередь только не теряет запись.
 */
import type { CreateEntryInput } from "@/ports/gas-ops";

export const FIELD_QUEUE_KEY = "neeklo-gas-field-queue";

export interface QueuedEntry {
  clientKey: string;
  input: CreateEntryInput;
  savedAt: string;
}

/** Ключ отправки: один на черновик формы, повторная отправка того же черновика его не меняет */
export function newClientKey(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `field-${random}`;
}

/** Добавить в очередь; тот же ключ заменяет прежнюю запись, а не дублирует */
export function queueAdd(list: readonly QueuedEntry[], item: QueuedEntry): QueuedEntry[] {
  return [...list.filter((q) => q.clientKey !== item.clientKey), item];
}

export function queueRemove(list: readonly QueuedEntry[], clientKey: string): QueuedEntry[] {
  return list.filter((q) => q.clientKey !== clientKey);
}

export function readQueue(storage: Storage | null): QueuedEntry[] {
  try {
    const raw = storage?.getItem(FIELD_QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(storage: Storage | null, list: readonly QueuedEntry[]): void {
  try {
    if (list.length === 0) storage?.removeItem(FIELD_QUEUE_KEY);
    else storage?.setItem(FIELD_QUEUE_KEY, JSON.stringify(list));
  } catch {
    // Запрет записи: очередь живёт до перезагрузки, экран это не скрывает
  }
}

export type SendResult =
  /** `auto` — запись принята системой без менеджера (режим «только с замечаниями») */
  | { ok: true; number: string; auto?: boolean }
  /** `network` — не дошло до сервера: запись остаётся и уйдёт при следующей попытке */
  | { ok: false; network: boolean; message: string };

export interface DrainResult {
  /** Что осталось на телефоне */
  queue: QueuedEntry[];
  accepted: { clientKey: string; number: string; auto: boolean }[];
  /** Отказ правила: запись снята с очереди, причину надо показать бригадиру */
  refused: { clientKey: string; message: string }[];
}

/**
 * Отправить очередь по порядку. Сбой сети останавливает отправку: остальное уйдёт при следующей
 * связи тем же ключом, дубля не будет. Отказ правила снимает запись и идёт дальше
 */
export async function drainQueue(
  list: readonly QueuedEntry[],
  send: (item: QueuedEntry) => Promise<SendResult>,
): Promise<DrainResult> {
  const queue = [...list];
  const accepted: DrainResult["accepted"] = [];
  const refused: DrainResult["refused"] = [];
  while (queue.length > 0) {
    const item = queue[0]!;
    const result = await send(item);
    if (!result.ok && result.network) break;
    queue.shift();
    if (result.ok)
      accepted.push({ clientKey: item.clientKey, number: result.number, auto: !!result.auto });
    else refused.push({ clientKey: item.clientKey, message: result.message });
  }
  return { queue, accepted, refused };
}
