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
