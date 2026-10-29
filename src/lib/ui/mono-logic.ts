/**
 * Логика компонентов «Монохрома» (ADR-055, S3): форматирование чисел показателей,
 * изменение по смыслу, точки графика и клавиши таблицы. Без React: проверяет bun test.
 */

const NBSP = "\u00a0";

/** Разряды через неразрывный пробел: «1 527 150». Intl даёт узкий, в макетах обычный */
function groups(value: number, digits = 0): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .format(value)
    .replace(/\u202f/g, NBSP);
}

/** Деньги: «1 527 150 ₽», копейки не показываются; нет значения — «—» */
export function formatRub(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${groups(Math.round(value))}${NBSP}₽`;
}

/** Часы из минут: «7,5 ч», «361,42 ч» — до двух знаков, без хвостовых нулей */
export function formatHours(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—";
  const hours = Math.round((minutes / 60) * 100) / 100;
  const digits = Number.isInteger(hours) ? 0 : Number.isInteger(hours * 10) ? 1 : 2;
  return `${groups(hours, digits)}${NBSP}ч`;
}

/** Человеко-часы: минуты бригады × люди уже сложены в personMinutes. «12,5 чел.-ч» */
export function formatManHours(personMinutes: number | null | undefined): string {
  const hours = formatHours(personMinutes);
  return hours === "—" ? hours : hours.replace(/ч$/, "чел.-ч");
}

export type DeltaTone = "good" | "bad" | "neutral";

export interface Delta {
  direction: "up" | "down" | "flat";
  tone: DeltaTone;
  /** Изменение в процентах, со знаком, округлено до целого */
  percent: number;
  /** «+12 %», «−4 %», «0 %» */
  label: string;
}

/**
 * Изменение показателя по смыслу: рост начислений хорош, рост «ждут решения» плох.
 * Прошлого значения нет или оно ноль — изменения нет (null), процент не выдумывается.
 */
export function deltaOf(
  current: number | null,
  previous: number | null,
  better: "up" | "down" = "up",
): Delta | null {
  if (current === null || previous === null || previous === 0) return null;
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  const tone: DeltaTone = direction === "flat" ? "neutral" : direction === better ? "good" : "bad";
  const sign = percent > 0 ? "+" : percent < 0 ? "−" : "";
  return { direction, tone, percent, label: `${sign}${Math.abs(percent)}${NBSP}%` };
}

export interface ChartPoint {
  x: string;
  current: number | null;
  previous: number | null;
}

/**
 * Точки графика «по времени». Отсутствующее значение остаётся null: линия рвётся,
 * а не падает в ноль (день без данных — не день с нулём).
 */
export function chartPoints(
  xs: readonly string[],
  current: readonly (number | null | undefined)[],
  previous: readonly (number | null | undefined)[] = [],
): ChartPoint[] {
  const clean = (v: number | null | undefined) =>
    v === null || v === undefined || !Number.isFinite(v) ? null : v;
  return xs.map((x, i) => ({ x, current: clean(current[i]), previous: clean(previous[i]) }));
}

/** Разница точки подсказки: «+8 %» к прошлому периоду, если оба значения есть */
export function pointDelta(point: ChartPoint, better: "up" | "down" = "up"): Delta | null {
  return deltaOf(point.current, point.previous, better);
}

/* ---------------------------------------------------------------- Клавиши таблицы */

export interface TableState {
  /** Строка под курсором, индекс в списке; −1 — курсора нет */
  cursor: number;
  /** Открытая строка (панель деталей) */
  open: string | null;
  selected: ReadonlySet<string>;
}

export const initialTable: TableState = { cursor: -1, open: null, selected: new Set() };

/**
 * Клавиши таблицы на компьютере: J и K по списку, Enter открывает строку под курсором,
 * Esc закрывает панель, а без панели снимает выбор, X отмечает строку для действия пачкой.
 * Открытая панель листается вместе с курсором.
 */
export function tableKey(state: TableState, key: string, ids: readonly string[]): TableState {
  if (ids.length === 0) return state;
  const k = key.toLowerCase();
  if (k === "j" || k === "k") {
    const step = k === "j" ? 1 : -1;
    const from = state.cursor < 0 ? (step > 0 ? -1 : ids.length) : state.cursor;
    const cursor = Math.min(ids.length - 1, Math.max(0, from + step));
    return { ...state, cursor, open: state.open === null ? null : ids[cursor]! };
  }
  if (k === "enter") {
    const id = ids[state.cursor];
    return id ? { ...state, open: id } : state;
  }
  if (k === "escape") {
    if (state.open !== null) return { ...state, open: null };
    return state.selected.size ? { ...state, selected: new Set() } : state;
  }
  if (k === "x") {
    const id = ids[state.cursor];
    return id ? { ...state, selected: toggleSelected(state.selected, id) } : state;
  }
  return state;
}

export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** «Выбрать все»: если все уже выбраны — снять выбор */
export function toggleAll(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  return ids.every((id) => selected.has(id)) ? new Set() : new Set(ids);
}

/** Состояние флажка «все»: да, нет или частично */
export function allState(
  selected: ReadonlySet<string>,
  ids: readonly string[],
): boolean | "indeterminate" {
  const count = ids.filter((id) => selected.has(id)).length;
  if (count === 0) return false;
  return count === ids.length ? true : "indeterminate";
}

/* ---------------------------------------------------------------- Доли */

export interface SharePart {
  key: string;
  value: number;
}

/** Доли в процентах, целые и в сумме ровно 100 (метод наибольшего остатка) */
export function sharePercents(parts: readonly SharePart[]): Record<string, number> {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  if (total === 0) return Object.fromEntries(parts.map((p) => [p.key, 0]));
  const raw = parts.map((p) => ({ key: p.key, exact: (Math.max(0, p.value) / total) * 100 }));
  const floors = raw.map((r) => ({ ...r, floor: Math.floor(r.exact) }));
  let rest = 100 - floors.reduce((sum, r) => sum + r.floor, 0);
  const order = [...floors].sort((a, b) => b.exact - b.floor - (a.exact - a.floor));
  const out: Record<string, number> = Object.fromEntries(floors.map((r) => [r.key, r.floor]));
  for (const r of order) {
    if (rest <= 0) break;
    out[r.key]! += 1;
    rest -= 1;
  }
  return out;
}
