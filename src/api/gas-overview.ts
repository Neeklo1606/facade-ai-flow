/**
 * Обзор направления (ADR-052, экраны): готовые числа для полосы показателей и панелей.
 * Всё считается из записей теми же правилами, что отчёт: суммы частей сходятся с целым
 * (тест `tests/domain/gas-ops-overview.test.ts`). Плана недели в данных нет — честная метка.
 */
import { useMemo } from "react";
import { fmtHours, fmtRate, fmtRub } from "@/domain/gas-ops/calc";
import { ENTRY_STATUS_LABEL, type EntryStatus } from "@/domain/gas-ops/model";
import { dayShortLabel } from "@/domain/gas-ops/report";
import { brigadeCards, dashboardMetrics, queueCounts, type GasData } from "@/domain/gas-ops/view";
import { useGasData } from "@/lib/gas-ops/use-gas-ops";

export interface OverviewData {
  kpis: {
    amount: { value: string; trend: number[] };
    hours: { value: string; trend: number[] };
    rate: { value: string; trend: number[] };
    waiting: { value: string; note: string };
  };
  /** Сумма по дням: столбцы и подписи */
  days: { key: string; label: string; value: number; text: string }[];
  bestDay: string | null;
  statuses: { label: string; value: number; text: string }[];
  statusTotal: number;
  brigades: { id: string; label: string; value: number; text: string; meta: string }[];
  costs: { label: string; value: number; text: string }[];
  totalAmountRub: number;
}

const STATUS_ORDER: EntryStatus[] = ["confirmed", "pending", "clarify", "draft", "rejected"];

/** «298 т» — тысячи рублей для подписи столбца, где «298 410 ₽» не помещается */
function short(rub: number): string {
  if (rub === 0) return "0";
  return rub >= 1000 ? `${Math.round(rub / 1000).toLocaleString("ru-RU")} т` : String(rub);
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export function overviewOf(data: GasData): OverviewData {
  const metrics = dashboardMetrics(data);
  const counts = queueCounts(data);
  const cards = brigadeCards(data, "confirmed");
  const days = metrics.byDay.map((d) => ({
    key: d.day,
    label: dayShortLabel(d.day),
    value: d.amountRub,
    text: short(d.amountRub),
  }));
  const best = metrics.byDay.reduce<(typeof metrics.byDay)[number] | null>(
    (a, d) => (d.amountRub > (a?.amountRub ?? 0) ? d : a),
    null,
  );
  const statuses = STATUS_ORDER.map((status) => ({
    label: ENTRY_STATUS_LABEL[status],
    value: counts[status],
    text: `${counts[status]}`,
  }));
  const costKinds = [
    { label: "Подтверждена по смете", value: 0 },
    { label: "Введена вручную", value: 0 },
    { label: "Нет стоимости", value: 0 },
  ];
  for (const o of data.objects) {
    const e = data.estimates.find((x) => x.objectId === o.id);
    if (e?.status === "confirmed" && e.origin === "estimate") costKinds[0]!.value++;
    else if (e?.status === "confirmed") costKinds[1]!.value++;
    else costKinds[2]!.value++;
  }
  const waiting = metrics.pending + metrics.clarify;
  return {
    kpis: {
      amount: {
        value: fmtRub(metrics.totals.amountRub),
        trend: metrics.byDay.map((d) => d.amountRub),
      },
      hours: { value: fmtHours(metrics.totals.hours), trend: metrics.byDay.map((d) => d.minutes) },
      rate: {
        value: fmtRate(metrics.totals.revenuePerHour),
        trend: metrics.byDay.map((d) => d.revenue ?? 0),
      },
      waiting: {
        value: String(waiting),
        note: `${metrics.pending} на проверке, ${metrics.clarify} на уточнении`,
      },
    },
    days,
    bestDay: best ? `${dayShortLabel(best.day)}: ${fmtRub(best.amountRub)}` : null,
    statuses,
    statusTotal: data.entries.length,
    brigades: cards
      .filter((c) => c.totals.amountRub > 0)
      .sort((a, b) => b.totals.amountRub - a.totals.amountRub)
      .slice(0, 6)
      .map((c) => ({
        id: c.brigade.id,
        label: c.brigade.name,
        value: c.totals.amountRub,
        text: fmtRub(c.totals.amountRub),
        meta: `${fmtHours(c.totals.hours)} · ${fmtRate(c.totals.revenuePerHour)}`,
      })),
    costs: costKinds.map((k) => ({
      ...k,
      text: `${k.value} ${plural(k.value, "объект", "объекта", "объектов")}`,
    })),
    totalAmountRub: metrics.totals.amountRub,
  };
}

export function useGasOverview(): OverviewData {
  const data = useGasData();
  return useMemo(() => overviewOf(data), [data]);
}
