/**
 * Слой данных экрана недельного отчёта (ADR-044, F6): вид при переключателях, путь
 * до записи из сценария, отметки «новая» и сверка с файлом заказчика.
 *
 * Экран получает готовые строки и тексты; формулы живут в домене (`report.ts`,
 * `reconcile.ts`), а сюда приходят уже посчитанными.
 */
import { useMemo } from "react";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import { factReport } from "@/data/mock/fact-report";
import { reconcile, reconcileLines, type ReconcileLine } from "@/domain/gas-ops/reconcile";
import {
  changedEntryIds,
  dayShortLabel,
  entriesOfRows,
  gasReportFileName,
  pathToEntry,
  visibleReportRows,
  type AnalyticRow,
  type ReportMode,
  type ReportPeriod,
  type ReportRow,
} from "@/domain/gas-ops/report";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { useGasData } from "@/lib/gas-ops/use-gas-ops";
import { useGasReport } from "./gas-ops";

export type { ReconcileLine, ReportPeriod };

export interface ReportViewOptions {
  mode: ReportMode;
  period: ReportPeriod;
  hideEmpty: boolean;
  highlight: string | null;
}

export interface ReportView {
  /** Все строки отчёта в режиме и строки вида после «скрыть пустые» */
  allRows: ReportRow[];
  rows: ReportRow[];
  /** Записи аналитической таблицы и листа «Записи»: те же, что под строками вида */
  analytic: AnalyticRow[];
  days: { iso: string; label: string }[];
  week: { from: string; to: string };
  count: number;
  total: ReportRow | null;
  /** Записи, изменённые в этой вкладке: точка «новая» у строки */
  changed: Set<string>;
  /** Строка из `?highlight=`: её id, родители и день */
  target: { rowId: string; ancestors: string[]; dayIndex: number | null } | null;
  fileName: string;
}

export function useGasReportView(options: ReportViewOptions): ReportView {
  const data = useGasData();
  const report = useGasReport(options.mode);
  const { period, hideEmpty, highlight } = options;

  return useMemo(() => {
    const rows = visibleReportRows(report.rows, { period, hideEmpty });
    const inRows = entriesOfRows(rows);
    return {
      allRows: report.rows,
      rows,
      analytic: report.analytic.filter((row) => inRows.has(row.entryId)),
      days: report.days.map((iso) => ({ iso, label: dayShortLabel(iso) })),
      week: report.week,
      count: report.count,
      total: rows.find((row) => row.kind === "total") ?? null,
      changed: changedEntryIds(data.entries, getServerSnapshot().entries),
      target: highlight ? pathToEntry(report.rows, highlight, data.entries, report.days) : null,
      fileName: gasReportFileName(report.week),
    };
  }, [report, data.entries, period, hideEmpty, highlight]);
}

/** Строки блока сверки для набора записей системы: экран и тест берут их отсюда */
export function reconcileLinesOf(entries: TimeEntry[]): ReconcileLine[] {
  return reconcileLines(
    reconcile(
      {
        week: factReport.meta.week,
        entries: factReport.entries,
        grandTotal: factReport.grandTotal.total,
        groupCodes: factReport.groups.map((group) => group.code),
      },
      entries,
    ),
  );
}

/** Блок «Сверка с вашим файлом»: строки текста посчитаны кодом сверки */
export function useGasReconcile(): ReconcileLine[] {
  const data = useGasData();
  return useMemo(() => reconcileLinesOf(data.entries), [data.entries]);
}
