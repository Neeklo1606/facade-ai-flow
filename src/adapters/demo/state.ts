import { buildSnapshot, type FixtureSnapshot } from "@/adapters/fixtures";
import { readStorage, removeStorage, writeStorage } from "./storage";

/**
 * Состояние демо: снимок фикстур, изменённый действиями пользователя и событиями симулятора.
 * Живёт в модуле адаптера; экраны видят его только через порты и кеш запросов.
 */

/** Отложенное событие симулятора. Хранится в состоянии, чтобы продолжиться после перезагрузки. */
export type DemoJob =
  | { kind: "upload"; dueAt: number; revisionId: string; stage: number }
  | { kind: "reply"; dueAt: number; requestId: string; supplierId: string }
  | { kind: "order"; dueAt: number; decisionId: string }
  | { kind: "shipment"; dueAt: number; deliveryId: string };

export interface DemoState extends FixtureSnapshot {
  version: number;
  /** Стадия обработки загруженной ревизии, 0…4 */
  uploads: Record<string, number>;
  jobs: DemoJob[];
}

const STORAGE_KEY = "neeklo-fieldops-demo";
/** Меняется при несовместимом изменении формы состояния: старое сохранение тогда игнорируется */
const STATE_VERSION = 4;
const SAVE_DELAY_MS = 300;

const seed = (): DemoState => ({
  version: STATE_VERSION,
  ...buildSnapshot(),
  uploads: {},
  jobs: [],
});

let state: DemoState = seed();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const getState = () => state;

function save() {
  saveTimer = null;
  writeStorage(STORAGE_KEY, JSON.stringify(state));
}

export function update(next: (prev: DemoState) => DemoState) {
  state = next(state);
  // Сохранение с задержкой: серия действий (подтверждение пачки строк) пишется один раз
  if (typeof window !== "undefined" && !saveTimer) saveTimer = setTimeout(save, SAVE_DELAY_MS);
}

/** Поднять сохранение вкладки; при другой версии формы — начать со стартовых данных */
export function restoreState() {
  try {
    const raw = readStorage(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DemoState) : null;
    if (parsed?.version === STATE_VERSION) state = parsed;
  } catch {
    state = seed();
  }
  window.addEventListener("pagehide", () => {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    save();
  });
}

export function resetState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  removeStorage(STORAGE_KEY);
  state = seed();
}

/* ---------- События без действия пользователя ---------- */

export type DemoEventArea = "documents" | "positions" | "projects" | "procurement" | "timeline";

export interface DemoEvent {
  /** Области кеша запросов, данные которых изменились */
  areas: DemoEventArea[];
  /** Что показать пользователю, если событие заметное: пришло предложение, поставка в пути */
  notice?: { title: string; description: string };
}

const listeners = new Set<(event: DemoEvent) => void>();
/** События, случившиеся до подписки: после перезагрузки симулятор догоняет пропущенное раньше, чем открылся экран */
let missed: DemoEvent[] = [];

export function onDemoEvent(listener: (event: DemoEvent) => void) {
  listeners.add(listener);
  const replay = missed;
  missed = [];
  replay.forEach(listener);
  return () => void listeners.delete(listener);
}

export function emitDemoEvent(event: DemoEvent) {
  if (!listeners.size) missed.push(event);
  listeners.forEach((listener) => listener(event));
}
