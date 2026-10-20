/**
 * Полный анонимизированный набор вместе с деревом строк исходного файла.
 *
 * Дерево нужно только сверке с файлом заказчика: скриптам аудита и контрольным тестам.
 * Во вкладку оно не едет — там набор без дерева (`fact-report.ts`), иначе четверть веса
 * клиентского набора уходила бы на данные, которые интерфейс не показывает.
 */
import full from "./fact-report.anonymized.json";
import type { FactDayValue, FactNode, FactReport } from "./fact-report";

export interface FactReportFull extends Omit<FactReport, "frames"> {
  tree: FactNode[];
  grandTotal: { label: string; excelRow: number; values: FactDayValue[]; total: FactDayValue };
}

export const factReportFull = full as unknown as FactReportFull;
