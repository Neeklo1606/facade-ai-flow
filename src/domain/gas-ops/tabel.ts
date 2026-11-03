/**
 * «Табель» (ADR-061, 11; раздел 4.5): рабочая сетка недели поверх строк «Формата заказчика».
 *
 * Строки и итоги — из `customerFormatRows` (report.ts): родители считаются снизу вверх без
 * двойного счёта. Здесь только то, что нужно сетке:
 * - статус ячейки цветом вместо переключателя «Подтверждённые / Предварительный»;
 * - вид «По людям» из поимённых строк записей;
 * - выделение, TSV для буфера обмена и итоги выделенного, как в Google Таблицах;
 * - контрольная сумма закрытой версии.
 */
import { manMinutesOf } from "./crew";
import type { Employee, Estimate, TimeEntry } from "./model";
import { customerFormatRows, type ReportInput, type ReportRow } from "./report";

/* ---------------------------------------------------------------- Показатели */

export type Metric = "amount" | "hours" | "rate" | "man";

export const METRIC_LABEL: Record<Metric, string> = {
  amount: "Сумма начисления",
  hours: "Эффективное время",
  rate: "Доходность часа",
  man: "Чел.-ч",
};

export const METRIC_SHORT: Record<Metric, string> = {
  amount: "Сумма",
  hours: "Часы",
  rate: "₽/ч",
  man: "Чел.-ч",
};

/** Порядок показателей: «сначала деньги» как в файле заказчика или «сначала время» */
export function metricOrder(visible: readonly Metric[], order: "money" | "time"): Metric[] {
  const base: Metric[] =
    order === "money" ? ["amount", "hours", "rate", "man"] : ["hours", "man", "amount", "rate"];
  return base.filter((m) => visible.includes(m));
}

/* ---------------------------------------------------------------- Ячейки */

/**
 * Статус ячейки (4.5):
 * - `ok` — все записи приняты;
 * - `draft` — есть непроверенные записи;
 * - `missing` — по графику ждали запись, её нет;
 * - `off` — выходной или день без графика, записей нет.
 */
export type CellStatus = "ok" | "draft" | "missing" | "off";

export interface TabelCell {
  amountRub: number | null;
  minutes: number | null;
  revenue: number | null;
  /** Человеко-минуты; null — хотя бы у одной записи нет состава (неизвестное не ноль) */
  manMinutes: number | null;
  entryIds: string[];
  status: CellStatus;
  /** ✎ ручная сумма, ⚠ нет подтверждённой сметы объекта */
  manual: boolean;
  noEstimate: boolean;
}

export interface TabelRow {
  id: string;
  kind: ReportRow["kind"];
  level: number;
  label: string;
  parentId: string | null;
  hasChildren: boolean;
  days: TabelCell[];
  total: TabelCell;
}

export interface TabelInput extends Omit<ReportInput, "mode" | "frames"> {
  estimates: Estimate[];
  /** Ожидания по графику или назначениям: «бригада|день|объект» */
  expected: { brigadeId: string; day: string; objectId: string }[];
}

/**
 * В сетке — принятые и ждущие проверки записи (предварительный набор): непроверенное видно
 * цветом ячейки. Утверждённая выгрузка берёт только принятые (`reportEntries`, «confirmed»)
 */
export function tabelRows(input: TabelInput): TabelRow[] {
  const report = customerFormatRows({ ...input, frames: [], mode: "preliminary" });
  const byId = new Map(input.entries.map((e) => [e.id, e]));
  const confirmed = new Set(
    input.estimates.filter((e) => e.status === "confirmed").map((e) => e.objectId),
  );
  const manualObjects = new Set(
    input.estimates.filter((e) => e.origin === "manual").map((e) => e.objectId),
  );
  const expected = new Set(input.expected.map((x) => `${x.brigadeId}|${x.day}|${x.objectId}`));
  const expectedBrigadeDay = new Set(input.expected.map((x) => `${x.brigadeId}|${x.day}`));
  const parents = new Set(report.map((r) => r.parentId).filter(Boolean));

  const cellOf = (
    row: ReportRow,
    list: TimeEntry[],
    value: Pick<TabelCell, "amountRub" | "minutes" | "revenue">,
    day: string | null,
  ): TabelCell => {
    const man = list.map(manMinutesOf);
    const own = list.filter((e) => e.source !== "fact-report");
    let status: CellStatus;
    if (list.length > 0) status = list.some((e) => e.status !== "confirmed") ? "draft" : "ok";
    else status = day && isExpected(row, day) ? "missing" : "off";
    return {
      ...value,
      manMinutes:
        list.length === 0 || man.some((m) => m === null)
          ? null
          : man.reduce<number>((a, m) => a + (m ?? 0), 0),
      entryIds: list.map((e) => e.id),
      status,
      manual: own.some((e) => manualObjects.has(e.objectId) && e.amountRub !== null),
      noEstimate: own.some((e) => !confirmed.has(e.objectId)),
    };
  };

  // Ожидание для строки: адрес — бригада, день и объект; агрегат — любая его бригада в этот день
  function isExpected(row: ReportRow, day: string): boolean {
    const week = row.entryIds.map((id) => byId.get(id)).filter((e): e is TimeEntry => !!e);
    if (row.kind === "address") {
      const sample = week[0];
      return !!sample && expected.has(`${sample.brigadeId}|${day}|${sample.objectId}`);
    }
    return [...new Set(week.map((e) => e.brigadeId))].some((b) =>
      expectedBrigadeDay.has(`${b}|${day}`),
    );
  }

  return report
    .filter((row) => row.kind !== "frame")
    .map((row) => {
      const all = row.entryIds.map((id) => byId.get(id)).filter((e): e is TimeEntry => !!e);
      return {
        id: row.id,
        kind: row.kind,
        level: row.level,
        label: row.label,
        parentId: row.parentId,
        hasChildren: parents.has(row.id),
        days: input.days.map((day, i) =>
          cellOf(
            row,
            all.filter((e) => e.day === day),
            row.days[i]!,
            day,
          ),
        ),
        total: cellOf(row, all, row.total, null),
      };
    });
}

/** Строки при свёрнутых группах: потомки свёрнутой строки скрыты */
export function visibleTabelRows(rows: readonly TabelRow[], collapsed: ReadonlySet<string>) {
  const hidden = new Set<string>();
  return rows.filter((row) => {
    if (row.parentId && (hidden.has(row.parentId) || collapsed.has(row.parentId))) {
      hidden.add(row.id);
      return false;
    }
    return true;
  });
}

/** Значение показателя ячейки числом для итогов и TSV; null — пусто */
export function metricValue(cell: TabelCell, metric: Metric): number | null {
  switch (metric) {
    case "amount":
      return cell.amountRub;
    case "hours":
      return cell.minutes === null ? null : Math.round((cell.minutes / 60) * 100) / 100;
    case "rate":
      return cell.revenue;
    case "man":
      return cell.manMinutes === null ? null : Math.round((cell.manMinutes / 60) * 100) / 100;
  }
}

/* ---------------------------------------------------------------- Вид «По людям» */

export interface PersonRow {
  id: string;
  label: string;
  brigadeId: string;
  /** Минуты по дням; null — в этот день человека в записях нет */
  days: (number | null)[];
  total: number;
  entryIds: string[][];
}

/**
 * Сотрудники × дни (как Табель ПТО Онлайн): часы из поимённых строк записей (`people`).
 * Записи без поимённого состава сюда не попадают: кто именно работал, неизвестно
 */
export function peopleRows(
  entries: readonly TimeEntry[],
  employees: readonly Employee[],
  days: readonly string[],
): PersonRow[] {
  const map = new Map<string, PersonRow>();
  for (const entry of entries) {
    if (entry.status === "rejected" || entry.status === "draft") continue;
    const index = days.indexOf(entry.day);
    if (index < 0) continue;
    for (const person of entry.people ?? []) {
      const employee = employees.find((e) => e.id === person.employeeId);
      const row =
        map.get(person.employeeId) ??
        ({
          id: person.employeeId,
          label: employee?.name ?? person.employeeId,
          brigadeId: employee?.brigadeId ?? entry.brigadeId,
          days: days.map(() => null),
          total: 0,
          entryIds: days.map(() => []),
        } satisfies PersonRow);
      row.days[index] = (row.days[index] ?? 0) + person.minutes;
      row.total += person.minutes;
      row.entryIds[index]!.push(entry.id);
      map.set(person.employeeId, row);
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

/** Итог по дням снизу таблицы «По людям» */
export function peopleTotals(rows: readonly PersonRow[], days: readonly string[]): number[] {
  return days.map((_, i) => rows.reduce((a, r) => a + (r.days[i] ?? 0), 0));
}

/* ---------------------------------------------------------------- Выделение */

export interface Point {
  row: number;
  col: number;
}

export interface Selection {
  anchor: Point;
  focus: Point;
}

export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export function rectOf(selection: Selection): Rect {
  return {
    top: Math.min(selection.anchor.row, selection.focus.row),
    bottom: Math.max(selection.anchor.row, selection.focus.row),
    left: Math.min(selection.anchor.col, selection.focus.col),
    right: Math.max(selection.anchor.col, selection.focus.col),
  };
}

export function inRect(rect: Rect, row: number, col: number): boolean {
  return row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right;
}

/** Шаг стрелкой: Shift расширяет выделение от якоря, без Shift — переносит ячейку */
export function moveSelection(
  selection: Selection,
  delta: Point,
  extend: boolean,
  size: { rows: number; cols: number },
): Selection {
  const clamp = (value: number, max: number) => Math.min(max - 1, Math.max(0, value));
  const focus = {
    row: clamp(selection.focus.row + delta.row, size.rows),
    col: clamp(selection.focus.col + delta.col, size.cols),
  };
  return extend ? { anchor: selection.anchor, focus } : { anchor: focus, focus };
}

/** Выделить строку или столбец целиком */
export function wholeRow(row: number, cols: number): Selection {
  return { anchor: { row, col: 0 }, focus: { row, col: cols - 1 } };
}
export function wholeColumn(col: number, rows: number): Selection {
  return { anchor: { row: 0, col }, focus: { row: rows - 1, col } };
}

export interface Stats {
  sum: number;
  avg: number | null;
  count: number;
}

/** «Сумма / Среднее / Количество» по числам выделенного; пустые ячейки не считаются нулём */
export function selectionStats(values: readonly (number | null)[]): Stats {
  const numbers = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const sum = numbers.reduce((a, v) => a + v, 0);
  return {
    sum: Math.round(sum * 100) / 100,
    avg: numbers.length ? Math.round((sum / numbers.length) * 100) / 100 : null,
    count: numbers.length,
  };
}

/** Число для буфера: без разделителя тысяч, запятая в дробной части (так читают Excel и Google в ru) */
export function tsvNumber(value: number | null): string {
  if (value === null) return "";
  return String(value).replace(".", ",");
}

/** Таблица в TSV: табуляция между ячейками, перевод строки между строками */
export function toTsv(matrix: readonly (readonly string[])[]): string {
  const clean = (text: string) =>
    /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""').replace(/\t/g, " ")}"` : text;
  return matrix.map((row) => row.map(clean).join("\t")).join("\n");
}

/* ---------------------------------------------------------------- Версия */

/**
 * Контрольная сумма записей закрытой версии: по ней видно, что файл версии собран из тех же
 * данных. FNV-1a 64 бита по строкам записей в порядке номера: это проверка целостности,
 * а не подпись
 */
export function versionChecksum(entries: readonly TimeEntry[]): string {
  const lines = [...entries]
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((e) =>
      [
        e.number,
        e.day,
        e.brigadeId,
        e.objectId,
        e.startMinutes,
        e.endMinutes,
        e.breakMinutes,
        e.minutes,
        e.amountRub,
        e.headcount ?? "",
      ].join("|"),
    )
    .join("\n");
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(lines)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}
