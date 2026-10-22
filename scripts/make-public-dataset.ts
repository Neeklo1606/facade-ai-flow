/**
 * Публичный набор «Демо-подрядчик» (ADR-047, 01_SPEC 6.1).
 *
 * Берёт анонимизированный набор заказчика и делает из него вымышленный той же формы:
 * - населённые пункты заменяются вымышленными с приставкой «Демо-», тип пункта сохраняется;
 * - стоимость работ умножается на множитель 0,7-1,3, свой у каждого объекта, и округляется до 50 ₽;
 * - доходность записи и итоги недели пересчитываются из записей, а не переносятся из файла;
 * - группы, бригады, сотрудники-роли, дни, часы и рамки смен сохраняются.
 *
 * Seed фиксирован: повторный запуск даёт тот же файл. Запуск `bun run data:public`,
 * результат `src/data/mock/public/fact-report.public.json` кладётся в git.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { factReport, type FactDayValue, type FactReport } from "@/data/mock/fact-report";
import { PUBLIC_PLACES, publicPlace } from "@/data/mock/public/places";

const OUT = "src/data/mock/public/fact-report.public.json";
const SEED = 20261023;

/** Детерминированный генератор mulberry32 */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round50 = (value: number) => Math.round(value / 50) * 50;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Тип пункта из начала названия: «ст.», «х.», «г.», «СТ», «п.» */
function kindOf(settlement: string): string {
  const match = settlement.match(/^(ст\.|х\.|г\.|п\.|пос\.|с\.|СТ|СНТ)\s/);
  return match?.[1] ?? "п.";
}

export function makePublicReport(source: FactReport): FactReport {
  const next = random(SEED);
  const settlements = [
    ...new Set(source.objects.map((o) => o.settlement).filter((s): s is string => !!s)),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  if (settlements.length > PUBLIC_PLACES.length) {
    throw new Error(`Вымышленных пунктов ${PUBLIC_PLACES.length}, нужно ${settlements.length}`);
  }
  const placeOf = new Map(
    settlements.map((real, index) => [real, publicPlace(index, kindOf(real))] as const),
  );

  const objects = source.objects.map((o) => {
    const settlement = o.settlement ? placeOf.get(o.settlement)! : null;
    const label = o.settlement && settlement ? o.label.replace(o.settlement, settlement) : o.label;
    return { ...o, settlement, label };
  });
  const factor = new Map(source.objects.map((o) => [o.id, 0.7 + next() * 0.6] as const));

  const entries = source.entries.map((e) => {
    const amount = e.amount === null ? null : round50(e.amount * (factor.get(e.objectId) ?? 1));
    const revenueInFile = amount !== null && e.hours ? Math.round(amount / e.hours) : null;
    return { ...e, amount, revenueInFile };
  });

  const values: FactDayValue[] = source.meta.days.map((_, day) => {
    const ofDay = entries.filter((e) => e.dayIndex === day);
    const amount = ofDay.reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const hours = round2(ofDay.reduce((sum, e) => sum + (e.hours ?? 0), 0));
    return { day, amount, hours, revenue: hours ? Math.round(amount / hours) : null };
  });
  const totalAmount = values.reduce((sum, v) => sum + (v.amount ?? 0), 0);
  const totalHours = round2(values.reduce((sum, v) => sum + (v.hours ?? 0), 0));

  return {
    ...source,
    meta: {
      ...source.meta,
      generatedBy: "scripts/make-public-dataset.ts",
      note:
        "Публичный набор «Демо-подрядчик»: вымышленные населённые пункты, суммы с множителем " +
        "0,7-1,3 на объект, итоги пересчитаны из записей. Структура недели взята из реального отчёта.",
    },
    objects,
    entries,
    grandTotal: {
      ...source.grandTotal,
      values,
      total: {
        day: -1,
        amount: totalAmount,
        hours: totalHours,
        revenue: totalHours ? Math.round(totalAmount / totalHours) : null,
      },
    },
  };
}

if (import.meta.main) {
  const report = makePublicReport(factReport);
  mkdirSync("src/data/mock/public", { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `${OUT}: объектов ${report.objects.length}, записей ${report.entries.length}, ` +
      `пунктов ${new Set(report.objects.map((o) => o.settlement)).size}`,
  );
}
