import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { overviewOf } from "@/api/gas-overview";
import { printReport } from "@/domain/gas-ops/print-report";

/** Отчёт руководителю в PDF (ADR-072): те же числа, что обзор и утверждённый Excel */
const seed = buildSeed();
const report = printReport({
  groups: seed.groups,
  brigades: seed.brigades,
  employees: seed.employees,
  objects: seed.objects,
  days: seed.week.days,
  entries: seed.entries,
  estimates: seed.estimates,
});

describe("отчёт на листе", () => {
  test("начислено как в обзоре: только принятые записи", () => {
    const overview = overviewOf({ ...seed, actorId: "u-director" });
    expect(report.kpis.amountRub).toBe(overview.totalAmountRub);
    expect(report.kpis.confirmed).toBe(seed.entries.filter((e) => e.status === "confirmed").length);
  });

  test("ждущие проверки названы числом, а в строки не попали", () => {
    const waiting = seed.entries.filter((e) => e.status === "pending" || e.status === "clarify");
    expect(report.kpis.waiting).toBe(waiting.length);
    const listed = new Set(report.rows.map((r) => r.label));
    expect(listed.size).toBeGreaterThan(0);
  });

  test("часы по дням складываются в часы недели", () => {
    const sum = report.dayTotals.reduce((a, h) => a + h, 0);
    expect(Math.round(sum * 100)).toBe(Math.round(report.kpis.hours * 100));
  });

  test("строка без часов не печатается, у строки дни по числу дней недели", () => {
    for (const row of report.rows) {
      expect(row.hours).toBeGreaterThan(0);
      expect(row.dayHours).toHaveLength(seed.week.days.length);
    }
  });
});
