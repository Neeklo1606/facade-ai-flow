/**
 * Телеметрия сессии (ADR-010): журнал вкладки в sessionStorage. Наружу не уходит —
 * это статистика для того, кто сидит за экраном, её показывает скрытый экран /demo-stats.
 * Журнал же служит шиной событий для проводки: шаг засчитывается по событию «открыт экран»
 * или «выполнено действие».
 */

export type TelemetryEvent =
  | { t: "screen"; at: number; screen: string; name: string; path: string }
  | { t: "action"; at: number; action: string; label: string; screen: string }
  | { t: "step"; at: number; scenario: string; step: string; status: "done" | "skipped" }
  | { t: "error"; at: number; message: string; screen: string }
  | { t: "feedback"; at: number; screen: string; step: string | null; text: string }
  | { t: "role"; at: number; role: string; personaId: string }
  | { t: "exit"; at: number; screen: string };

type NewEvent = TelemetryEvent extends infer E
  ? E extends TelemetryEvent
    ? Omit<E, "at">
    : never
  : never;

const KEY = "neeklo-fieldops-telemetry";
/** Потолок журнала: старые записи вытесняются, sessionStorage не бесконечен */
const LIMIT = 500;

/** Подписи действий. Ключи — `meta.action` мутаций и действия интерфейса без мутаций */
export const actionLabels: Record<string, string> = {
  confirmPositions: "Подтвердить позиции",
  confirmAutoVerified: "Подтвердить уверенные позиции",
  correctPosition: "Исправить позицию",
  excludePosition: "Исключить позицию",
  markHeader: "Отметить строку заголовком",
  reopenPosition: "Вернуть позицию на проверку",
  undoReview: "Отменить действие проверки",
  mergePositions: "Объединить позиции",
  splitPosition: "Разделить позицию",
  handOver: "Передать в закупку",
  uploadDocument: "Загрузить документ",
  createProject: "Создать объект",
  createRequest: "Отправить запрос поставщикам",
  remindSuppliers: "Напомнить поставщикам",
  chooseSupplier: "Зафиксировать решение",
  verifyContact: "Отметить контакт проверенным",
  reviewReport: "Принять отчёт с площадки",
  askAgent: "Спросить ассистента",
  offerReceived: "Пришло предложение поставщика",
  openAttention: "Открыть пункт «Требует решения»",
  openSource: "Открыть источник значения",
  inspectVoiceField: "Проверить распознанное поле по цитате",
  exportExcel: "Выгрузить в Excel",
  moveDelivery: "Отметить движение поставки",
  acceptDelivery: "Принять поставку",
  resolveRemark: "Закрыть замечание по поставке",
};

let events: TelemetryEvent[] = load();
let currentScreen = lastScreen(events);

function lastScreen(list: readonly TelemetryEvent[]) {
  for (let i = list.length - 1; i >= 0; i--) {
    const event = list[i];
    if (event?.t === "screen") return event.screen;
  }
  return "";
}
const listeners = new Set<(event: TelemetryEvent) => void>();

function load(): TelemetryEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    // Хранилище переполнено или запрещено: статистика проживёт до перезагрузки
  }
}

export function record(event: NewEvent) {
  if (typeof window === "undefined") return;
  const full = { ...event, at: Date.now() } as TelemetryEvent;
  if (full.t === "screen") currentScreen = full.screen;
  events.push(full);
  if (events.length > LIMIT) events = events.slice(-LIMIT);
  save();
  for (const listener of listeners) listener(full);
}

/** Действие по ключу: подпись берётся из словаря, экран — текущий */
export function recordAction(action: string) {
  record({ t: "action", action, label: actionLabels[action] ?? action, screen: currentScreen });
}

export function recordError(message: string) {
  record({ t: "error", message: message.slice(0, 300), screen: currentScreen });
}

export function onTelemetry(listener: (event: TelemetryEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function telemetryEvents(): readonly TelemetryEvent[] {
  return events;
}

export function currentScreenKey() {
  return currentScreen;
}

export function clearTelemetry() {
  events = [];
  save();
}

let exitTracking = false;
/** Точка выхода: экран, на котором вкладку закрыли или увели. Ставится один раз из корня */
export function startExitTracking() {
  if (exitTracking || typeof window === "undefined") return;
  exitTracking = true;
  window.addEventListener("pagehide", () => {
    if (currentScreen) record({ t: "exit", screen: currentScreen });
  });
}

/* ---------- Сводка для /demo-stats ---------- */

export interface ScreenTime {
  screen: string;
  name: string;
  visits: number;
  ms: number;
}

export interface ActionCount {
  action: string;
  label: string;
  count: number;
  lastAt: number;
}

export function summarize(list: readonly TelemetryEvent[] = events, now = Date.now()) {
  const times = new Map<string, ScreenTime>();
  const screensSeen = list.filter(
    (e): e is Extract<TelemetryEvent, { t: "screen" }> => e.t === "screen",
  );
  list.forEach((event, index) => {
    if (event.t !== "screen") return;
    // Время на экране — до следующего экрана или ухода; последний открытый экран — до «сейчас»
    const next = list.slice(index + 1).find((e) => e.t === "screen" || e.t === "exit");
    const until = next?.at ?? now;
    const entry = times.get(event.screen) ?? {
      screen: event.screen,
      name: event.name,
      visits: 0,
      ms: 0,
    };
    entry.visits += 1;
    entry.ms += Math.max(0, until - event.at);
    times.set(event.screen, entry);
  });

  const actions = new Map<string, ActionCount>();
  for (const event of list) {
    if (event.t !== "action") continue;
    const entry = actions.get(event.action) ?? {
      action: event.action,
      label: event.label,
      count: 0,
      lastAt: 0,
    };
    entry.count += 1;
    entry.lastAt = event.at;
    actions.set(event.action, entry);
  }

  const first = list[0]?.at ?? now;
  const exits = list.filter((e): e is Extract<TelemetryEvent, { t: "exit" }> => e.t === "exit");
  return {
    startedAt: first,
    durationMs: now - first,
    screens: [...times.values()].sort((a, b) => b.ms - a.ms),
    screenVisits: screensSeen.length,
    actions: [...actions.values()].sort((a, b) => b.count - a.count),
    steps: list.filter((e): e is Extract<TelemetryEvent, { t: "step" }> => e.t === "step"),
    errors: list.filter((e): e is Extract<TelemetryEvent, { t: "error" }> => e.t === "error"),
    feedback: list.filter(
      (e): e is Extract<TelemetryEvent, { t: "feedback" }> => e.t === "feedback",
    ),
    lastExit: exits.at(-1) ?? null,
  };
}
