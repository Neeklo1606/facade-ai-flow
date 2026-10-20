/**
 * Текст ячеек отчёта (ADR-044, F6): числа как в форматтерах раздела, пустое — прочерк,
 * а не ноль. Одни и те же строки у таблицы десктопа, дерева телефона и итога недели.
 */
import { fmtHours, fmtRate, fmtRub, type ReportRow } from "@/api/gas-ops";

export type ReportCellValue = ReportRow["total"];

export const DASH = "—";

export function amountText(cell: ReportCellValue): string {
  return cell.amountRub === null ? DASH : fmtRub(cell.amountRub);
}

export function hoursText(cell: ReportCellValue): string {
  return cell.minutes ? fmtHours(cell.minutes / 60) : DASH;
}

export function rateText(cell: ReportCellValue): string {
  return fmtRate(cell.revenue);
}

/** Три числа строки в одну линию: «44 847 ₽ · 6,58 ч · 6 812 ₽/ч» */
export function tripleText(cell: ReportCellValue): string {
  return `${amountText(cell)} · ${hoursText(cell)} · ${rateText(cell)}`;
}

export function hasValue(cell: ReportCellValue | undefined): cell is ReportCellValue {
  return !!cell && (cell.amountRub !== null || cell.minutes !== null);
}

/** Строка содержит запись, изменённую в этой вкладке */
export function isNewRow(row: ReportRow, changed: Set<string>): boolean {
  return row.kind === "address" && row.entryIds.some((id) => changed.has(id));
}
