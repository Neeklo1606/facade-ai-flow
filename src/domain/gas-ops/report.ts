/**
 * Недельный отчёт газового направления (ADR-043).
 *
 * Два режима по ТЗ, п. 9: «Формат заказчика» — та же структура, что в его Excel
 * (группа, бригада, сотрудник, строка рамки смены, адреса; по каждому дню три показателя
 * и колонка «Итого»), и «Аналитическая таблица» — плоские строки с фильтрами.
 *
 * Инварианты:
 *
 * 1. Итог любой строки считается снизу вверх, из адресных строк. Числа из файла заказчика
 *    в расчёт не берутся: иначе ошибка выгрузки стала бы правдой системы.
 * 2. Агрегаты не складываются с детьми: сумма группы — это сумма её бригад, а не
 *    сумма бригад плюс собственная строка.
 * 3. Сумма бригады не удваивается, когда в бригаде несколько сотрудников: деньги числятся
 *    за тем сотрудником, по чьим адресам они прошли.
 * 4. В утверждённый отчёт идут только подтверждённые записи. Предварительный помечается.
 * 5. Строка без суммы остаётся строкой без суммы: доходность у неё прочерк, а не ноль.
 */
import { hoursOfMinutes, revenuePerHour } from "./calc";
import type { Brigade, DataSource, Employee, Group, TimeEntry, WorkObject } from "./model";

export type ReportMode = "confirmed" | "preliminary";

export type ReportRowKind = "group" | "brigade" | "employee" | "frame" | "address" | "total";

export interface ReportCell {
  amountRub: number | null;
  minutes: number | null;
  revenue: number | null;
  /** Рамка смены для строки интервала: «8.20-16.40» */
  frame?: string;
}

export interface ReportRow {
  id: string;
  kind: ReportRowKind;
  /** Уровень группировки, как outline level в Excel: 0 группа, 3 адрес */
  level: number;
  label: string;
  days: ReportCell[];
  total: ReportCell;
  /** Текст рамки за неделю: «36 час 50 мин» */
  frameTotalText?: string;
  entryIds: string[];
  source: DataSource | "mixed" | null;
  parentId: string | null;
}

export interface ReportInput {
  entries: TimeEntry[];
  groups: Group[];
  brigades: Brigade[];
  employees: Employee[];
  objects: WorkObject[];
  frames: { brigadeId: string; employeeId: string | null; day: string; frame: string }[];
  days: string[];
  mode: ReportMode;
}

const empty = (): ReportCell => ({ amountRub: null, minutes: null, revenue: null });

function cellOf(entries: TimeEntry[]): ReportCell {
  if (entries.length === 0) return empty();
  const withAmount = entries.filter((e) => e.amountRub !== null);
  const amountRub =
    withAmount.length === 0 ? null : withAmount.reduce((a, e) => a + e.amountRub!, 0);
  const minutes = entries.reduce((a, e) => a + e.minutes, 0);
  return {
    amountRub,
    minutes: minutes === 0 ? null : minutes,
    revenue: revenuePerHour(amountRub, minutes),
  };
}

function sumCells(cells: ReportCell[]): ReportCell {
  const amounts = cells.filter((c) => c.amountRub !== null);
  const amountRub = amounts.length === 0 ? null : amounts.reduce((a, c) => a + c.amountRub!, 0);
  const minutes = cells.reduce((a, c) => a + (c.minutes ?? 0), 0);
  return {
    amountRub,
    minutes: minutes === 0 ? null : minutes,
    revenue: revenuePerHour(amountRub, minutes),
  };
}

/** Записи, которые попадают в отчёт в этом режиме (инвариант 4) */
export function reportEntries(entries: TimeEntry[], mode: ReportMode): TimeEntry[] {
  return mode === "confirmed"
    ? entries.filter((e) => e.status === "confirmed")
    : entries.filter((e) => e.status === "confirmed" || e.status === "pending");
}

function sourceOf(entries: TimeEntry[]): DataSource | "mixed" | null {
  if (entries.length === 0) return null;
  const kinds = new Set(entries.map((e) => e.source));
  return kinds.size === 1 ? [...kinds][0]! : "mixed";
}

/**
 * Строки «Формата заказчика». Порядок как в его файле: группа, внутри бригады,
 * внутри сотрудники, под сотрудником строка рамки смены и адреса.
 */
export function customerFormatRows(input: ReportInput): ReportRow[] {
  const { groups, brigades, employees, objects, frames, days, mode } = input;
  const entries = reportEntries(input.entries, mode);
  const rows: ReportRow[] = [];

  const byDay = (list: TimeEntry[]) => days.map((day) => cellOf(list.filter((e) => e.day === day)));

  /** Адресные строки одного владельца: по объекту, значения разложены по дням */
  function addressRows(owner: TimeEntry[], parentId: string, level: number): ReportRow[] {
    const objectIds = [...new Set(owner.map((e) => e.objectId))];
    // порядок как в отчёте заказчика: по подписи объекта
    objectIds.sort((a, b) => {
      const la = objects.find((o) => o.id === a)?.label ?? a;
      const lb = objects.find((o) => o.id === b)?.label ?? b;
      return la.localeCompare(lb, "ru");
    });
    return objectIds.map((objectId) => {
      const own = owner.filter((e) => e.objectId === objectId);
      const object = objects.find((o) => o.id === objectId);
      const cells = byDay(own);
      return {
        id: `${parentId}/obj-${objectId}`,
        kind: "address" as const,
        level,
        label: object?.label ?? objectId,
        days: cells,
        total: sumCells(cells),
        entryIds: own.map((e) => e.id),
        source: sourceOf(own),
        parentId,
      };
    });
  }

  for (const group of groups) {
    const groupBrigades = brigades.filter((b) => b.groupId === group.id);
    const groupEntries = entries.filter((e) => groupBrigades.some((b) => b.id === e.brigadeId));
    if (groupEntries.length === 0) continue;

    const groupRow: ReportRow = {
      id: `g-${group.id}`,
      kind: "group",
      level: 0,
      label: group.name,
      days: [],
      total: empty(),
      entryIds: groupEntries.map((e) => e.id),
      source: sourceOf(groupEntries),
      parentId: null,
    };
    rows.push(groupRow);
    const groupChildrenCells: ReportCell[][] = [];

    for (const brigade of groupBrigades) {
      const brigadeEntries = groupEntries.filter((e) => e.brigadeId === brigade.id);
      if (brigadeEntries.length === 0) continue;

      const brigadeRow: ReportRow = {
        id: `b-${brigade.id}`,
        kind: "brigade",
        level: 1,
        label: brigade.name,
        days: [],
        total: empty(),
        entryIds: brigadeEntries.map((e) => e.id),
        source: sourceOf(brigadeEntries),
        parentId: groupRow.id,
      };
      rows.push(brigadeRow);
      const brigadeChildrenCells: ReportCell[][] = [];

      const brigadeEmployees = employees.filter((e) => e.brigadeId === brigade.id);
      const used = new Set<string>();

      for (const employee of brigadeEmployees) {
        const own = brigadeEntries.filter((e) => e.employeeId === employee.id);
        if (own.length === 0) continue;
        own.forEach((e) => used.add(e.id));

        const employeeRow: ReportRow = {
          id: `e-${employee.id}`,
          kind: "employee",
          level: 2,
          label: employee.name,
          days: [],
          total: empty(),
          entryIds: own.map((e) => e.id),
          source: sourceOf(own),
          parentId: brigadeRow.id,
        };
        rows.push(employeeRow);

        // строка рамки смены: что видел бригадир как начало и окончание дня
        const ownFrames = frames.filter(
          (f) =>
            f.brigadeId === brigade.id && (f.employeeId === employee.id || f.employeeId === null),
        );
        if (ownFrames.length > 0) {
          const frameCells = days.map((day) => {
            const frame = ownFrames.find((f) => f.day === day);
            return frame ? { ...empty(), frame: frame.frame } : empty();
          });
          const frameMinutes = ownFrames.reduce((a, f) => a + frameSpan(f.frame), 0);
          rows.push({
            id: `f-${employee.id}`,
            kind: "frame",
            level: 2,
            label: "",
            days: frameCells,
            total: { ...empty(), minutes: frameMinutes },
            frameTotalText: frameText(frameMinutes),
            entryIds: [],
            source: null,
            parentId: employeeRow.id,
          });
        }

        const addresses = addressRows(own, employeeRow.id, 3);
        rows.push(...addresses);
        const employeeCells = days.map((_, i) => sumCells(addresses.map((a) => a.days[i]!)));
        employeeRow.days = employeeCells;
        employeeRow.total = sumCells(employeeCells);
        brigadeChildrenCells.push(employeeCells);
      }

      // записи бригады без сотрудника: в отчёте заказчика так устроена группа 3
      const orphans = brigadeEntries.filter((e) => !used.has(e.id));
      if (orphans.length > 0) {
        const addresses = addressRows(orphans, brigadeRow.id, 2);
        rows.push(...addresses);
        brigadeChildrenCells.push(days.map((_, i) => sumCells(addresses.map((a) => a.days[i]!))));
      }

      const brigadeCells = days.map((_, i) => sumCells(brigadeChildrenCells.map((c) => c[i]!)));
      brigadeRow.days = brigadeCells;
      brigadeRow.total = sumCells(brigadeCells);
      groupChildrenCells.push(brigadeCells);
    }

    const groupCells = days.map((_, i) => sumCells(groupChildrenCells.map((c) => c[i]!)));
    groupRow.days = groupCells;
    groupRow.total = sumCells(groupCells);
  }

  // строка «Итого»: сумма групп, без собственных записей (инвариант 2)
  const groupRows = rows.filter((r) => r.kind === "group");
  const totalCells = input.days.map((_, i) => sumCells(groupRows.map((r) => r.days[i]!)));
  rows.push({
    id: "total",
    kind: "total",
    level: 0,
    label: "Итого",
    days: totalCells,
    total: sumCells(totalCells),
    entryIds: groupRows.flatMap((r) => r.entryIds),
    source: sourceOf(entries),
    parentId: null,
  });

  return rows;
}

/** «8.20-16.40» → минуты рамки. Через полночь в отчёте заказчика не встречается */
export function frameSpan(frame: string): number {
  const [from, to] = frame.split("-").map((part) => {
    const [h, m] = part.trim().split(/[.:]/);
    return Number(h) * 60 + Number(m ?? 0);
  });
  const span = (to ?? 0) - (from ?? 0);
  return span > 0 ? span : 0;
}

function frameText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} час` : `${h} час ${m} мин`;
}

// --- аналитическая таблица ---------------------------------------------------

export interface AnalyticRow {
  entryId: string;
  number: string;
  day: string;
  groupName: string;
  brigadeName: string;
  employeeName: string;
  objectLabel: string;
  workType: string | null;
  settlement: string | null;
  minutes: number;
  hours: number;
  amountRub: number | null;
  revenue: number | null;
  status: TimeEntry["status"];
  source: DataSource;
}

export function analyticRows(input: Omit<ReportInput, "frames">): AnalyticRow[] {
  const entries = reportEntries(input.entries, input.mode);
  return entries.map((e) => {
    const brigade = input.brigades.find((b) => b.id === e.brigadeId);
    const group = input.groups.find((g) => g.id === brigade?.groupId);
    const employee = input.employees.find((x) => x.id === e.employeeId);
    const object = input.objects.find((o) => o.id === e.objectId);
    return {
      entryId: e.id,
      number: e.number,
      day: e.day,
      groupName: group?.name ?? "—",
      brigadeName: brigade?.name ?? e.brigadeId,
      employeeName: employee?.name ?? "—",
      objectLabel: object?.label ?? e.objectId,
      workType: object?.workType ?? null,
      settlement: object?.settlement ?? null,
      minutes: e.minutes,
      hours: hoursOfMinutes(e.minutes),
      amountRub: e.amountRub,
      revenue: revenuePerHour(e.amountRub, e.minutes),
      status: e.status,
      source: e.source,
    };
  });
}

// --- вид отчёта на экране и в файле (ADR-044, F6) ------------------------------

/**
 * Период вида: вся неделя, один день (индекс в `days`) или только колонка «Итого».
 * Набор строк и в файле, и на экране определяется периодом и галочкой «скрыть пустые».
 */
export type ReportPeriod = "week" | "total" | number;

/** Есть ли в строке значения в выбранном периоде: деньги, минуты или рамка смены */
export function rowHasValues(row: ReportRow, period: ReportPeriod): boolean {
  if (row.kind === "total") return true;
  if (typeof period === "number") {
    const cell = row.days[period];
    if (!cell) return false;
    return cell.amountRub !== null || cell.minutes !== null || !!cell.frame;
  }
  if (row.kind === "frame") return row.days.some((cell) => !!cell.frame);
  return row.total.amountRub !== null || row.total.minutes !== null;
}

/**
 * Строки вида при текущих переключателях. «Скрыть пустые» по умолчанию выключено:
 * тогда вид совпадает с Excel заказчика. Агрегат с пустыми детьми сам пуст (итоги снизу
 * вверх), поэтому родители непустых строк остаются без отдельного правила. Строка рамки
 * смены уходит вместе со своим сотрудником.
 */
export function visibleReportRows(
  rows: ReportRow[],
  options: { period: ReportPeriod; hideEmpty: boolean },
): ReportRow[] {
  if (!options.hideEmpty) return rows;
  const kept = new Set<string>();
  const result: ReportRow[] = [];
  for (const row of rows) {
    if (row.parentId && !kept.has(row.parentId)) continue;
    if (!rowHasValues(row, options.period)) continue;
    kept.add(row.id);
    result.push(row);
  }
  return result;
}

/** Путь до адресной строки записи: сама строка, её день и все родители сверху вниз */
export function pathToEntry(
  rows: ReportRow[],
  entryId: string,
  entries: Pick<TimeEntry, "id" | "day">[],
  days: string[],
): { rowId: string; ancestors: string[]; dayIndex: number | null } | null {
  const row = rows.find((r) => r.kind === "address" && r.entryIds.includes(entryId));
  if (!row) return null;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ancestors: string[] = [];
  let parent = row.parentId;
  while (parent) {
    ancestors.unshift(parent);
    parent = byId.get(parent)?.parentId ?? null;
  }
  const day = entries.find((e) => e.id === entryId)?.day;
  const index = day ? days.indexOf(day) : -1;
  return { rowId: row.id, ancestors, dayIndex: index >= 0 ? index : null };
}

/**
 * Записи, которые изменились в этой вкладке относительно исходного набора: созданы,
 * подтверждены, исправлены. Строка с такой записью отмечается точкой «новая».
 */
export function changedEntryIds(current: TimeEntry[], base: TimeEntry[]): Set<string> {
  const before = new Map(base.map((e) => [e.id, e]));
  const changed = new Set<string>();
  for (const entry of current) {
    const was = before.get(entry.id);
    if (
      !was ||
      was.status !== entry.status ||
      was.minutes !== entry.minutes ||
      was.amountRub !== entry.amountRub ||
      was.objectId !== entry.objectId ||
      was.day !== entry.day ||
      was.reviewedAt !== entry.reviewedAt
    ) {
      changed.add(entry.id);
    }
  }
  return changed;
}

/** Записи, на которых стоят строки вида: так лист «Записи» совпадает с листом «Отчёт» */
export function entriesOfRows(rows: ReportRow[]): Set<string> {
  return new Set(rows.filter((r) => r.kind === "address").flatMap((r) => r.entryIds));
}

const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

/** «Сб 03.10»: подпись дня в узких местах */
export function dayShortLabel(iso: string): string {
  const weekday = WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
  return `${weekday} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const ddmmyyyy = (iso: string) => `${ddmm(iso)}.${iso.slice(0, 4)}`;

/**
 * Имя файла выгрузки: «Выработка_бригад_28.09-03.10.2026.xlsx». Одно правило для сервера
 * (заголовок ответа) и для вкладки (имя при сохранении), иначе они разойдутся.
 */
export function gasReportFileName(week: { from: string; to: string }, label?: FileLabel): string {
  return `Выработка_бригад_${ddmm(week.from)}-${ddmmyyyy(week.to)}${suffixOf(label, "ru")}.xlsx`;
}

/** Запасное имя латиницей для `filename=` в заголовке: старые клиенты не читают `filename*` */
export function gasReportFileNameAscii(
  week: { from: string; to: string },
  label?: FileLabel,
): string {
  return `Vyrabotka_brigad_${ddmm(week.from)}-${ddmmyyyy(week.to)}${suffixOf(label, "ascii")}.xlsx`;
}

/**
 * Метка файла (ADR-056, 5): версия закрытой недели или черновик. Без метки — прежнее имя,
 * как его ждёт отчёт заказчика
 */
export type FileLabel = { version: number } | { draft: true } | null | undefined;

function suffixOf(label: FileLabel, kind: "ru" | "ascii"): string {
  if (!label) return "";
  if ("version" in label) return `_v${label.version}`;
  return kind === "ru" ? "_черновик" : "_draft";
}
