/**
 * Отчёт руководителю на листе A4 (ADR-072): PDF в любой момент. Только принятые записи,
 * как в утверждённом файле Excel: непроверенное на бумагу не попадает, а сколько его —
 * сказано в шапке. Строки — те же, что в табеле (`tabelRows`), поэтому итоги совпадают
 * с экраном и с Excel.
 */
import { hoursOfMinutes, totalsOf } from "./calc";
import type { TimeEntry } from "./model";
import { tabelRows, type TabelInput, type TabelRow } from "./tabel";

export interface PrintRow {
  id: string;
  kind: TabelRow["kind"];
  level: number;
  label: string;
  /** Часы по дням недели; null — работ в этот день не было */
  dayHours: (number | null)[];
  hours: number;
  amountRub: number | null;
  revenue: number | null;
}

export interface PrintReport {
  kpis: {
    amountRub: number;
    hours: number;
    revenue: number | null;
    confirmed: number;
    /** Ждут проверки или уточнения: в отчёт не вошли */
    waiting: number;
    /** Принятые без суммы: нет подтверждённой стоимости объекта */
    withoutAmount: number;
    brigades: number;
    objects: number;
  };
  rows: PrintRow[];
  /** Итог по дням: часы принятых записей */
  dayTotals: number[];
}

export function printReport(input: Omit<TabelInput, "expected">): PrintReport {
  const confirmed = input.entries.filter((e: TimeEntry) => e.status === "confirmed");
  const waiting = input.entries.filter((e) => e.status === "pending" || e.status === "clarify");
  const rows = tabelRows({ ...input, entries: confirmed, expected: [] }).filter(
    (r) => r.total.minutes !== null && r.total.minutes > 0,
  );
  const totals = totalsOf(confirmed);
  const hours = (m: number | null) => (m === null || m === 0 ? null : hoursOfMinutes(m));
  return {
    kpis: {
      amountRub: totals.amountRub,
      hours: hoursOfMinutes(totals.minutes),
      revenue: totals.revenuePerHour,
      confirmed: confirmed.length,
      waiting: waiting.length,
      withoutAmount: totals.withoutAmount,
      brigades: new Set(confirmed.map((e) => e.brigadeId)).size,
      objects: new Set(confirmed.map((e) => e.objectId)).size,
    },
    rows: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      level: r.level,
      label: r.label,
      dayHours: r.days.map((d) => hours(d.minutes)),
      hours: hoursOfMinutes(r.total.minutes ?? 0),
      amountRub: r.total.amountRub,
      revenue: r.total.revenue,
    })),
    dayTotals: input.days.map((day) =>
      hoursOfMinutes(confirmed.filter((e) => e.day === day).reduce((a, e) => a + e.minutes, 0)),
    ),
  };
}
