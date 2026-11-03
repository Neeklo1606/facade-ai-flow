/**
 * Сверка недели с Excel заказчика (финальный промт, 1.8; ADR-063). Инструмент пилота: Оксана
 * ведёт ручной отчёт «ФАКТИЧЕСКИЙ ОТЧЁТ», руководитель загружает его за ту же неделю и видит
 * расхождения по объектам и дням с причиной: нет записи, нет в файле, другое время,
 * другая сумма сметы.
 *
 * Файл читается по виду, а не по уровням группировки: строка шапки — та, где стоят даты
 * дней; под каждой датой три столбца (сумма, часы, доходность). Адресные строки находятся
 * по названию объекта системы; строки бригад, бригадиров и рамок смены не сверяются.
 * В системе берутся только принятые записи: с файлом сравнивается утверждённый отчёт.
 */
import type { Cell, Grid } from "./estimate-labels";
import type { TimeEntry, WorkObject } from "./model";

export type ReconcileReason = "no-entry" | "not-in-file" | "time" | "amount" | "time-amount";

export const RECONCILE_REASON_LABEL: Record<ReconcileReason, string> = {
  "no-entry": "нет записи в системе",
  "not-in-file": "нет в файле заказчика",
  time: "другое время",
  amount: "другая сумма сметы",
  "time-amount": "другое время и сумма",
};

export interface FileWeek {
  days: string[];
  /** Сумма и часы по объекту и дню: ключ «объект|день» */
  cells: Map<string, { amountRub: number; hours: number }>;
  /** Строки с цифрами, чей адрес не нашёлся среди объектов: их видно, а не теряем */
  unknown: { row: number; label: string }[];
}

export interface Discrepancy {
  objectId: string;
  objectLabel: string;
  day: string;
  file: { amountRub: number; hours: number } | null;
  system: { amountRub: number; hours: number } | null;
  reason: ReconcileReason;
}

export interface FileReconciliation {
  days: string[];
  /** Пары «объект · день», где цифры есть хотя бы с одной стороны */
  compared: number;
  matched: number;
  discrepancies: Discrepancy[];
  unknown: { row: number; label: string }[];
}

const norm = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const text = (cell: Cell) => (cell === null || cell === undefined ? "" : String(cell).trim());

/** Дата в ячейке: «28.09.2026», «2026-09-28» или число Excel */
export function cellDay(cell: Cell): string | null {
  if (typeof cell === "number" && cell > 40000 && cell < 60000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(cell) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const value = text(cell);
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return iso ? iso[1]! : null;
}

const num = (cell: Cell): number | null => {
  if (typeof cell === "number") return cell;
  const value = text(cell).replace(/\s/g, "").replace(",", ".");
  return value && Number.isFinite(Number(value)) ? Number(value) : null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Прочитать неделю из сетки листа; шапки с датами нет — null */
export function readFileWeek(grid: Grid, objects: readonly WorkObject[]): FileWeek | null {
  let header = -1;
  let dayCols: { col: number; day: string }[] = [];
  for (let r = 0; r < Math.min(grid.length, 20); r += 1) {
    const found: { col: number; day: string }[] = [];
    const seen = new Set<string>();
    (grid[r] ?? []).forEach((cell, col) => {
      const day = cellDay(cell);
      if (day && !seen.has(day)) {
        seen.add(day);
        found.push({ col, day });
      }
    });
    if (found.length >= 3) {
      header = r;
      dayCols = found;
      break;
    }
  }
  if (header < 0) return null;

  const byLabel = new Map(objects.map((o) => [norm(o.label), o]));
  const cells = new Map<string, { amountRub: number; hours: number }>();
  const unknown: FileWeek["unknown"] = [];
  for (let r = header + 1; r < grid.length; r += 1) {
    const row = grid[r] ?? [];
    const label = text(row[0]);
    if (!label) continue;
    const values = dayCols.map(({ col, day }) => ({
      day,
      amountRub: num(row[col]),
      hours: num(row[col + 1]),
    }));
    const any = values.some((v) => v.amountRub !== null || v.hours !== null);
    if (!any) continue;
    const object = byLabel.get(norm(label));
    if (!object) {
      // Адрес отличим от бригады и бригадира по запятой или улице
      if (/,|ул\.|пер\.|д\.\s*\d/.test(label)) unknown.push({ row: r + 1, label });
      continue;
    }
    for (const v of values) {
      if (v.amountRub === null && v.hours === null) continue;
      const key = `${object.id}|${v.day}`;
      const prev = cells.get(key) ?? { amountRub: 0, hours: 0 };
      cells.set(key, {
        amountRub: prev.amountRub + (v.amountRub ?? 0),
        hours: round2(prev.hours + (v.hours ?? 0)),
      });
    }
  }
  return { days: dayCols.map((d) => d.day), cells, unknown };
}

/** Сравнить файл с принятыми записями системы до рубля и до сотой часа */
export function reconcileFile(
  file: FileWeek,
  entries: readonly TimeEntry[],
  objects: readonly WorkObject[],
): FileReconciliation {
  const week = new Set(file.days);
  const system = new Map<string, { amountRub: number; minutes: number }>();
  for (const e of entries) {
    if (e.status !== "confirmed" || !week.has(e.day)) continue;
    const key = `${e.objectId}|${e.day}`;
    const prev = system.get(key) ?? { amountRub: 0, minutes: 0 };
    system.set(key, {
      amountRub: prev.amountRub + (e.amountRub ?? 0),
      minutes: prev.minutes + e.minutes,
    });
  }
  const label = (id: string) => objects.find((o) => o.id === id)?.label ?? id;
  const keys = [...new Set([...file.cells.keys(), ...system.keys()])].sort();
  const discrepancies: Discrepancy[] = [];
  let matched = 0;
  for (const key of keys) {
    const [objectId, day] = key.split("|") as [string, string];
    const f = file.cells.get(key) ?? null;
    const s = system.get(key);
    const sys = s ? { amountRub: Math.round(s.amountRub), hours: round2(s.minutes / 60) } : null;
    let reason: ReconcileReason | null = null;
    if (f && !sys) reason = "no-entry";
    else if (!f && sys) reason = "not-in-file";
    else if (f && sys) {
      const time = Math.abs(f.hours - sys.hours) > 0.01;
      const amount = Math.abs(Math.round(f.amountRub) - sys.amountRub) >= 1;
      reason = time && amount ? "time-amount" : time ? "time" : amount ? "amount" : null;
    }
    if (!reason) {
      matched += 1;
      continue;
    }
    discrepancies.push({
      objectId,
      objectLabel: label(objectId),
      day,
      file: f,
      system: sys,
      reason,
    });
  }
  return { days: file.days, compared: keys.length, matched, discrepancies, unknown: file.unknown };
}
