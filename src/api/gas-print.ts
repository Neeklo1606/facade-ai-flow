/**
 * Отчёт руководителю для PDF (ADR-072): готовые строки листа. Числа — `printReport`
 * домена, здесь только подписи: экран ничего не считает (P3-1).
 */
import { useMemo } from "react";
import { fmtHours, fmtRub } from "@/domain/gas-ops/calc";
import { dayShortLabel } from "@/domain/gas-ops/report";
import { printReport } from "@/domain/gas-ops/print-report";
import { plural } from "@/lib/format";
import { useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";

export interface PrintSheet {
  title: string;
  note: string;
  kpis: { label: string; value: string; note?: string | undefined }[];
  dayLabels: string[];
  rows: {
    id: string;
    level: number;
    strong: boolean;
    label: string;
    days: string[];
    hours: string;
    amount: string;
    rate: string;
  }[];
  totals: { days: string[]; hours: string; amount: string; rate: string };
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const num = (h: number | null) =>
  h === null || h === 0
    ? ""
    : h.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = (v: number | null) => (v === null ? "–" : v.toLocaleString("ru-RU"));
const rub = (v: number | null) => (v === null ? "–" : fmtRub(v));

export function useGasPrintReport(): PrintSheet {
  const s = useGasSnapshot();
  return useMemo(() => {
    const r = printReport({
      groups: s.groups,
      brigades: s.brigades,
      employees: s.employees,
      objects: s.objects,
      days: s.week.days,
      entries: s.entries,
      estimates: s.estimates,
    });
    const k = r.kpis;
    return {
      title: `Отчёт за неделю ${ddmmyyyy(s.week.from)}–${ddmmyyyy(s.week.to)}`,
      note: `Только принятые записи: ${k.confirmed}. ${
        k.waiting
          ? `Ещё ${k.waiting} ${plural(k.waiting, "запись ждёт", "записи ждут", "записей ждут")} проверки и в отчёт не вошли.`
          : "Непроверенных нет."
      }`,
      kpis: [
        { label: "Начислено", value: fmtRub(k.amountRub) },
        { label: "Эффективное время", value: fmtHours(k.hours) },
        {
          label: "Доходность часа",
          value: k.revenue === null ? "–" : `${k.revenue.toLocaleString("ru-RU")} ₽/ч`,
        },
        {
          label: "Бригад и объектов",
          value: `${k.brigades} / ${k.objects}`,
          note: k.withoutAmount ? `без суммы: ${k.withoutAmount}` : undefined,
        },
      ],
      dayLabels: s.week.days.map(dayShortLabel),
      rows: r.rows.map((row) => ({
        id: row.id,
        level: row.level,
        strong: row.kind === "group" || row.kind === "brigade",
        label: row.label,
        days: row.dayHours.map(num),
        hours: num(row.hours),
        amount: rub(row.amountRub),
        rate: rate(row.revenue),
      })),
      totals: {
        days: r.dayTotals.map(num),
        hours: num(k.hours),
        amount: fmtRub(k.amountRub),
        rate: rate(k.revenue),
      },
    };
  }, [s]);
}
