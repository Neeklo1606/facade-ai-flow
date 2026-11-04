/**
 * Лист недели облачной таблицы заказчика в формате «ФАКТИЧЕСКИЙ ОТЧЁТ» (финальный промт, 1.4;
 * ADR-063). Строки: подразделение → бригада → бригадир → объект, столбцы: дни × три показателя
 * (сумма начисления, эффективное время, доходность часа) и итог недели. Строка с
 * непроверенными записями помечена «черновик» в последнем столбце и подсвечивается.
 *
 * Здесь только расчёт: что лежит в листе и какие диапазоны изменились с прошлой отправки.
 * Отправку делает адаптер порта `SheetSyncPort`, не чаще раза в минуту (`nextPushAt`).
 */
import type { TabelRow } from "./tabel";

export type SheetValue = string | number | null;

export const SHEET_METRICS = ["Сумма начислений", "Эффективное время (ч.)", "Доходность часа"];
export const DRAFT_MARK = "черновик";

export interface SheetRow {
  /** Ключ строки табеля: по нему сравниваются отправки */
  key: string;
  values: SheetValue[];
  draft: boolean;
}

export interface WeekSheet {
  /** Название листа: «Неделя 28.09–03.10.2026» */
  title: string;
  header: SheetValue[][];
  rows: SheetRow[];
  /** Число столбцов: подпись, дни × 3, итог × 3, отметка */
  width: number;
}

const ruDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Часы с двумя знаками: в листе то же значение, что в файле недели */
const hours = (minutes: number | null) =>
  minutes === null ? null : Math.round((minutes / 60) * 100) / 100;

export function weekSheetTitle(weekFrom: string, weekTo: string): string {
  return `Неделя ${ruDate(weekFrom).slice(0, 5)}–${ruDate(weekTo)}`;
}

export function factReportSheet(input: {
  weekFrom: string;
  weekTo: string;
  days: readonly string[];
  rows: readonly TabelRow[];
}): WeekSheet {
  const width = 1 + input.days.length * 3 + 3 + 1;
  const top: SheetValue[] = ["ФАКТИЧЕСКИЙ ОТЧЁТ"];
  const second: SheetValue[] = ["Бригада и адрес"];
  for (const day of input.days) {
    top.push(ruDate(day), null, null);
    second.push(...SHEET_METRICS);
  }
  top.push("Итого за неделю", null, null, "Отметка");
  second.push(...SHEET_METRICS, null);

  const rows = input.rows.map((row): SheetRow => {
    const draft = row.total.status === "draft";
    const values: SheetValue[] = [`${"  ".repeat(row.level)}${row.label}`];
    for (const cell of [...row.days, row.total])
      values.push(cell.amountRub, hours(cell.minutes), cell.revenue);
    values.push(draft ? DRAFT_MARK : null);
    return { key: row.id, values, draft };
  });
  return {
    title: weekSheetTitle(input.weekFrom, input.weekTo),
    header: [top, second],
    rows,
    width,
  };
}

/** Буквы столбца: 1 → A, 27 → AA */
export function columnName(index: number): string {
  let n = index;
  let name = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export interface RangeUpdate {
  /** «A3:Y5» без имени листа: имя добавляет адаптер */
  range: string;
  values: SheetValue[][];
}

const HEADER_ROWS = 2;

/**
 * Что отправить: при первой отправке или другом составе строк — весь лист, иначе только
 * подряд идущие изменившиеся строки. Повтор с тем же листом ничего не отправляет.
 */
export function changedRanges(prev: WeekSheet | null, next: WeekSheet): RangeUpdate[] {
  const last = columnName(next.width);
  const sameShape =
    !!prev &&
    prev.width === next.width &&
    prev.title === next.title &&
    prev.rows.length === next.rows.length &&
    prev.rows.every((r, i) => r.key === next.rows[i]!.key);
  if (!sameShape) {
    const values = [...next.header, ...next.rows.map((r) => r.values)];
    return [{ range: `A1:${last}${values.length}`, values }];
  }
  const changed = next.rows.map(
    (row, i) => JSON.stringify(row.values) !== JSON.stringify(prev.rows[i]!.values),
  );
  const updates: RangeUpdate[] = [];
  let start = -1;
  for (let i = 0; i <= changed.length; i += 1) {
    if (i < changed.length && changed[i]) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) {
      const from = HEADER_ROWS + start + 1;
      const to = HEADER_ROWS + i;
      updates.push({
        range: `A${from}:${last}${to}`,
        values: next.rows.slice(start, i).map((r) => r.values),
      });
      start = -1;
    }
  }
  return updates;
}

/** Номера строк листа (с 1), которые подсвечиваются как черновик */
export function draftRowNumbers(sheet: WeekSheet): number[] {
  return sheet.rows.flatMap((row, i) => (row.draft ? [HEADER_ROWS + i + 1] : []));
}

export const PUSH_INTERVAL_MS = 60_000;

/** Когда можно отправить следующий пакет: не чаще раза в минуту */
export function nextPushAt(lastPushAt: string | null, now: string): string {
  if (!lastPushAt) return now;
  const next = Date.parse(lastPushAt) + PUSH_INTERVAL_MS;
  return new Date(Math.max(next, Date.parse(now))).toISOString();
}

/** Подпись в интерфейсе: только то, что правда */
export function sheetStatusText(state: { connected: boolean; updatedAt: string | null }): string {
  if (!state.connected) return "Облачная таблица: не подключена";
  if (!state.updatedAt) return "Облачная таблица подключена, ещё не обновлялась";
  return `Таблица обновлена ${state.updatedAt.slice(11, 16)}`;
}
