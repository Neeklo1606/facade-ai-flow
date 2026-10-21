/**
 * Чистая логика компонентов финального интерфейса (ADR-045, раздел 4): то, что проверяется
 * юнит-тестами без браузера. Компоненты в src/components/ui/kit берут решения отсюда.
 */

/* ---------------------------------------------------------------- ChipRow: «+N» (4.10) */

/**
 * Метки одной строкой: не больше `max` видимых, остальные в «+N». Порядок важности задаёт
 * вызывающий: блокирующие признаки идут первыми.
 */
export function splitChips<T>(items: readonly T[], max = 2): { shown: T[]; rest: number } {
  const limit = Math.max(0, Math.floor(max));
  if (items.length <= limit) return { shown: [...items], rest: 0 };
  return { shown: items.slice(0, limit), rest: items.length - limit };
}

/* ---------------------------------------------------------------- ScrollTabs (4.11) */

/**
 * Куда прокрутить ряд вкладок, чтобы активная целиком попала в видимую часть с учётом
 * затухания краёв. Возвращает новый scrollLeft или null, если активная уже видна.
 */
export function revealScrollLeft(
  view: { scrollLeft: number; width: number; scrollWidth: number },
  item: { left: number; width: number },
  fade = 16,
): number | null {
  const start = view.scrollLeft + fade;
  const end = view.scrollLeft + view.width - fade;
  const max = Math.max(0, view.scrollWidth - view.width);
  let next: number | null = null;
  if (item.left < start) next = item.left - fade;
  else if (item.left + item.width > end) next = item.left + item.width - view.width + fade;
  if (next === null) return null;
  return Math.min(max, Math.max(0, Math.round(next)));
}

/** Какие края ряда затухают: слева, если ряд прокручен, справа, если есть что докрутить */
export function fadeEdges(view: { scrollLeft: number; width: number; scrollWidth: number }) {
  return {
    start: view.scrollLeft > 1,
    end: view.scrollLeft + view.width < view.scrollWidth - 1,
  };
}

/* ---------------------------------------------------------------- Sheet и «назад» (4.13) */

export interface HistoryPort {
  push: (state: unknown) => void;
  back: () => void;
  state: () => unknown;
}

/**
 * Шторка добавляет запись в историю браузера: системный «назад» закрывает её, а не уводит
 * со страницы. Закрытие кнопкой убирает свою запись, чтобы «назад» потом не открывал пустоту.
 */
export function createSheetHistory(id: string, history: HistoryPort, onClose: () => void) {
  const marker = { sheet: id };
  let open = false;
  const ours = (state: unknown) =>
    typeof state === "object" && state !== null && (state as { sheet?: string }).sheet === id;
  return {
    open() {
      if (open) return;
      open = true;
      history.push(marker);
    },
    /** Закрыть кнопкой, свайпом или затемнением */
    close() {
      if (!open) return;
      open = false;
      if (ours(history.state())) history.back();
      onClose();
    },
    /** Событие popstate: пользователь нажал «назад» */
    pop(state: unknown) {
      if (!open || ours(state)) return;
      open = false;
      onClose();
    },
    get isOpen() {
      return open;
    },
  };
}

/* ---------------------------------------------------------------- Toast (4.5) */

export interface ToastPort {
  show: (id: string, text: string, options: { duration: number; undo?: () => void }) => void;
  dismiss: (id: string) => void;
}

/** 6 секунд для действия с отменой, 4 для уведомления */
export const TOAST_UNDO_MS = 6000;
export const TOAST_INFO_MS = 4000;

/**
 * Один тост за раз: новый заменяет старый. Отмена вызывается не больше одного раза.
 */
export function createToastQueue(port: ToastPort) {
  let current: string | null = null;
  let seq = 0;
  return {
    notify(text: string, options: { undo?: () => void } = {}) {
      if (current) port.dismiss(current);
      seq += 1;
      const id = `toast-${seq}`;
      current = id;
      let undone = false;
      const undo = options.undo
        ? () => {
            if (undone) return;
            undone = true;
            options.undo?.();
            port.dismiss(id);
            if (current === id) current = null;
          }
        : undefined;
      port.show(id, text, {
        duration: undo ? TOAST_UNDO_MS : TOAST_INFO_MS,
        ...(undo ? { undo } : {}),
      });
      return id;
    },
    get current() {
      return current;
    },
  };
}

/* ---------------------------------------------------------------- Время ЧЧ:ММ (4.8) */

/** «8:20», «8.20», «0820», «820» → «08:20»; неверное время → null */
export function parseTime(raw: string): string | null {
  const text = raw.trim().replace(/[.,\s-]/g, ":");
  let h: number;
  let m: number;
  const parts = text.split(":").filter(Boolean);
  if (parts.length === 2) {
    h = Number(parts[0]);
    m = Number(parts[1]);
    if (parts[1]!.length !== 2) return null;
  } else if (parts.length === 1 && /^\d{3,4}$/.test(parts[0]!)) {
    const digits = parts[0]!.padStart(4, "0");
    h = Number(digits.slice(0, 2));
    m = Number(digits.slice(2));
  } else if (parts.length === 1 && /^\d{1,2}$/.test(parts[0]!)) {
    h = Number(parts[0]);
    m = 0;
  } else return null;
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59)
    return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Кнопки времени с шагом 30 минут от `from` до `to` включительно, «ЧЧ:ММ» */
export function timeSlots(from: string, to: string, stepMin = 30): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const out: string[] = [];
  for (let t = toMin(from); t <= toMin(to); t += stepMin) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

/* ---------------------------------------------------------------- Календарь (4.8) */

/** Сетка месяца с понедельника: недели по 7 дней, дни чужого месяца null */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Подсветка совпадения поиска: части строки и признак совпадения, без учёта регистра */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLocaleLowerCase("ru");
  const needle = q.toLocaleLowerCase("ru");
  const parts: { text: string; hit: boolean }[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}

/** Склонение по числу: 1 запись, 2 записи, 5 записей */
export function plural(n: number, [one, few, many]: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/* ---------------------------------------------------------------- Статусы (3.5) */

export type EntryStatus = "pending" | "ok" | "clarify" | "rejected" | "draft";

export const STATUS_WORD: Record<EntryStatus, string> = {
  pending: "Ожидает проверки",
  ok: "Подтверждено",
  clarify: "Требует уточнения",
  rejected: "Отклонено",
  draft: "Черновик",
};
