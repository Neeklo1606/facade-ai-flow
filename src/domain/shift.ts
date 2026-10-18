import type { Evidence, FieldReport, Source, WorkZone } from "@/contracts";
import type { ExportColumn } from "./registry";

/**
 * Сводка смены и её выгрузка (ADR-037, п. 2). Инварианты, которые здесь соблюдаются:
 *
 * 1. В сводку идут только принятые отчёты: неподтверждённое в ней не появляется.
 * 2. Повтор приёмки не удваивает объём: строка одна на отчёт.
 * 3. Люди, часы и объём — разные показатели и стоят разными колонками.
 * 4. Разные единицы не складываются: итог считается по каждой единице отдельно.
 * 5. У каждой строки есть источник: номер записи и откуда она пришла.
 */

export interface ShiftRow {
  reportId: string;
  zoneName: string;
  workType: string;
  /** Принятый объём: именно он идёт в сводку, а не заявленный */
  qty: number;
  unit: string;
  people: number;
  /** Откуда пришла запись: сообщение с площадки, письмо, ручной ввод */
  sourceTitle: string;
  sourceLocation: string;
  /** Сколько материалов приложено: фото и записи */
  mediaCount: number;
}

export interface ShiftTotal {
  unit: string;
  qty: number;
}

export interface ShiftSummary {
  projectName: string;
  date: string;
  rows: ShiftRow[];
  /** Итоги по единицам: разные единицы не складываются (инвариант 4) */
  totals: ShiftTotal[];
  /** Люди и часы — отдельные показатели, не сумма объёмов (инвариант 3) */
  people: number;
  /** Сколько фактов ещё ждут проверки: сводка честно говорит, что она неполная */
  pending: number;
}

export interface ShiftInput {
  projectName: string;
  date: string;
  reports: FieldReport[];
  zones: WorkZone[];
  sources: Source[];
  evidence: Evidence[];
  /**
   * Если за эту дату принятых записей нет — показать последнюю смену, где они есть.
   * Сводка всегда называет свою дату, поэтому подмены не происходит: человек видит, за какой
   * день цифры. Нужно показу: назавтра после приёмки открывают экран и видят пустоту.
   */
  fallbackToLast?: boolean;
}

/** Последняя дата, за которую есть принятые записи; null — принятых нет вовсе */
export function lastAcceptedDate(reports: FieldReport[]): string | null {
  const dates = reports
    .filter((report) => report.status === "accepted")
    .map((report) => report.date)
    .sort();
  return dates.at(-1) ?? null;
}

export function shiftSummary(input: ShiftInput): ShiftSummary {
  const zoneName = (id: string) => {
    const zone = input.zones.find((item) => item.id === id);
    return zone ? [zone.name, zone.axes].filter(Boolean).join(", ") : "Захватка";
  };
  const hasAccepted = input.reports.some(
    (report) => report.date === input.date && report.status === "accepted",
  );
  const date =
    hasAccepted || !input.fallbackToLast
      ? input.date
      : (lastAcceptedDate(input.reports) ?? input.date);
  const ofDate = input.reports.filter((report) => report.date === date);
  const accepted = ofDate.filter((report) => report.status === "accepted");

  const rows: ShiftRow[] = accepted.map((report) => {
    const source = input.sources.find((item) => item.id === report.sourceId);
    return {
      reportId: report.id,
      zoneName: zoneName(report.zoneId),
      workType: report.workType,
      qty: report.acceptedQty ?? 0,
      unit: report.unit,
      people: report.headcount,
      sourceTitle: source?.title ?? "Внесено вручную",
      sourceLocation: source?.location ?? "—",
      mediaCount: input.evidence.filter((item) => item.reportId === report.id).length,
    };
  });

  const byUnit = new Map<string, number>();
  for (const row of rows) byUnit.set(row.unit, (byUnit.get(row.unit) ?? 0) + row.qty);

  return {
    projectName: input.projectName,
    date,
    rows,
    totals: [...byUnit.entries()]
      .map(([unit, qty]) => ({ unit, qty }))
      .sort((a, b) => a.unit.localeCompare(b.unit, "ru")),
    people: rows.reduce((sum, row) => sum + row.people, 0),
    pending: ofDate.filter((report) => report.status !== "accepted").length,
  };
}

/** Колонки сводки смены: у каждой строки есть источник (инвариант 5) */
export function shiftColumns(): ExportColumn<ShiftRow>[] {
  return [
    { header: "Захватка", width: 28, value: (row) => row.zoneName },
    { header: "Вид работ", width: 34, value: (row) => row.workType },
    { header: "Принято", width: 12, value: (row) => row.qty },
    { header: "Единица", width: 10, value: (row) => row.unit },
    { header: "Людей", width: 8, value: (row) => row.people },
    { header: "Материалов", width: 12, value: (row) => row.mediaCount },
    { header: "Источник", width: 34, value: (row) => row.sourceTitle },
    { header: "Место в источнике", width: 20, value: (row) => row.sourceLocation },
    { header: "Запись", width: 20, value: (row) => row.reportId },
  ];
}

/**
 * Колонки черновика ведомости объёмов для ПТО (ADR-037, сценарий 2). Это черновик, и так
 * подписано в самом файле: исполнительную документацию демонстрация не выпускает.
 */
export function statementColumns(): ExportColumn<ShiftRow>[] {
  return [
    { header: "№", width: 6, value: (row) => row.reportId },
    { header: "Наименование работ", width: 40, value: (row) => row.workType },
    { header: "Участок", width: 28, value: (row) => row.zoneName },
    { header: "Единица", width: 10, value: (row) => row.unit },
    { header: "Объём принят", width: 14, value: (row) => row.qty },
    { header: "Основание", width: 34, value: (row) => row.sourceTitle },
    {
      header: "Статус документа",
      width: 42,
      value: () => "Черновик, не исполнительная документация",
    },
  ];
}

/** Имя файла сводки: дата в названии, чтобы файлы не путались в загрузках */
export const shiftFileName = (projectName: string, date: string) =>
  `Сводка_${projectName.replace(/[^\p{L}\p{N}]+/gu, "-")}_${date}.xlsx`;

export const statementFileName = (projectName: string, date: string) =>
  `Ведомость-черновик_${projectName.replace(/[^\p{L}\p{N}]+/gu, "-")}_${date}.xlsx`;
