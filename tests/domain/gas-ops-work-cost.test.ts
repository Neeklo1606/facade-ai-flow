import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { customerFormatRows } from "@/domain/gas-ops/report";
import type { TimeEntry } from "@/domain/gas-ops/model";
import {
  DEFAULT_COMPANY_RULE,
  allocateByMinutes,
  applyRule,
  canConfirmVersion,
  fmtNormVsFact,
  latestConfirmed,
  nextVersion,
  normVsFact,
  recalcObject,
  ruleFor,
  ruleFormula,
  suggestObject,
  workCostRub,
  type CostRule,
  type EstimateVersion,
} from "@/domain/gas-ops/work-cost";

/** Стоимость работ из сметы (ADR-053, разделы 2 и 3) */

const version = (over: Partial<EstimateVersion>): EstimateVersion => ({
  id: "v1",
  objectId: "obj-1",
  version: 1,
  fileName: "смета.xlsx",
  sheet: "Смета",
  uploadedAt: "2026-10-25T10:00:00.000Z",
  uploadedBy: "u-manager",
  format: "resource",
  parseStatus: "parsed",
  totals: {
    withoutVat: { kopecks: 14_217_491, row: 182 },
    materials: { kopecks: 6_870_625, row: 184 },
    vat: { kopecks: 710_875, row: 189 },
    total: { kopecks: 14_928_366, row: 190 },
  },
  vatRate: 5,
  laborHours: { value: 57.644, row: 182 },
  sections: [],
  issues: [],
  issuesReviewedBy: null,
  confirmedBy: null,
  confirmedAt: null,
  ...over,
});

const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: "e",
  number: "ГЗ-00001",
  day: "2026-10-03",
  brigadeId: "brg-1",
  employeeId: null,
  objectId: "obj-1",
  startMinutes: null,
  endMinutes: null,
  breakMinutes: 0,
  minutes: 60,
  amountRub: null,
  status: "pending",
  createdBy: "u",
  createdAt: "2026-10-03T10:00:00.000Z",
  reviewedBy: null,
  reviewedAt: null,
  comment: null,
  source: "mock",
  ...over,
});

describe("правило состава", () => {
  test("по умолчанию «без НДС минус материалы», требует согласования", () => {
    expect(DEFAULT_COMPANY_RULE.status).toBe("needs-agreement");
    expect(ruleFormula(DEFAULT_COMPANY_RULE.terms)).toBe("Всего без НДС минус материалы");
    expect(ruleFormula([{ key: "withoutVat", sign: 1 }])).toBe("Всего без НДС");
  });

  test("переопределение объекта главнее правила компании", () => {
    const company: CostRule = { ...DEFAULT_COMPANY_RULE, status: "confirmed" };
    const own: CostRule = {
      ...company,
      id: "r2",
      objectId: "obj-2",
      terms: [{ key: "withoutVat", sign: 1 }],
    };
    expect(ruleFor("obj-1", [company, own]).id).toBe(company.id);
    expect(ruleFor("obj-2", [company, own]).id).toBe("r2");
    expect(ruleFor("obj-3", []).id).toBe(DEFAULT_COMPANY_RULE.id);
  });

  test("нет нужной строки итогов — нет числа, а не ноль", () => {
    expect(applyRule({ withoutVat: { kopecks: 100, row: 1 } }, DEFAULT_COMPANY_RULE.terms)).toEqual(
      {
        ok: false,
        missing: ["materials"],
      },
    );
  });

  test("стоимость целыми рублями: 73 468,66 → 73 469", () => {
    expect(workCostRub(version({}), DEFAULT_COMPANY_RULE)).toBe(73_469);
  });
});

describe("версии сметы", () => {
  test("стоимость из последней подтверждённой версии, неподтверждённая не участвует", () => {
    const list = [
      version({ id: "a", version: 1, confirmedAt: "2026-10-20T10:00:00.000Z", confirmedBy: "u" }),
      version({ id: "b", version: 2, confirmedAt: "2026-10-22T10:00:00.000Z", confirmedBy: "u" }),
      version({ id: "c", version: 3 }),
    ];
    expect(latestConfirmed("obj-1", list)?.id).toBe("b");
    expect(latestConfirmed("obj-2", list)).toBeNull();
    expect(nextVersion("obj-1", list)).toBe(4);
    expect(nextVersion(null, list)).toBe(1);
  });

  test("подтвердить нельзя без объекта и с непроверенными замечаниями", () => {
    expect(canConfirmVersion(version({ objectId: null })).ok).toBe(false);
    expect(canConfirmVersion(version({ parseStatus: "needs-review" })).ok).toBe(false);
    expect(
      canConfirmVersion(version({ parseStatus: "needs-review", issuesReviewedBy: "u-estimator" }))
        .ok,
    ).toBe(true);
    expect(canConfirmVersion(version({ parseStatus: "unknown-format" })).ok).toBe(false);
    expect(canConfirmVersion(version({})).ok).toBe(true);
  });
});

describe("распределение по минутам", () => {
  test("сумма частей равна стоимости ровно, наибольший остаток", () => {
    const shares = allocateByMinutes(100, [
      { id: "a", minutes: 1 },
      { id: "b", minutes: 1 },
      { id: "c", minutes: 1 },
    ]);
    expect([...shares.values()]).toEqual([34, 33, 33]);
    const odd = allocateByMinutes(73_469, [
      { id: "a", minutes: 395 },
      { id: "b", minutes: 150 },
      { id: "c", minutes: 245 },
    ]);
    expect([...odd.values()].reduce((x, y) => x + y, 0)).toBe(73_469);
    expect(odd.get("a")).toBe(36_734);
  });

  test("нулевые минуты: деление запрещено, вся сумма первой записи", () => {
    expect([
      ...allocateByMinutes(500, [
        { id: "a", minutes: 0 },
        { id: "b", minutes: 0 },
      ]).values(),
    ]).toEqual([500, 0]);
  });
});

describe("пересчёт при смене версии", () => {
  test("меняются только неподтверждённые записи, подтверждённые — в расхождение", () => {
    const entries = [
      entry({ id: "a", minutes: 120, status: "confirmed", amountRub: 10_000 }),
      entry({ id: "b", minutes: 60, status: "pending", amountRub: 4_000 }),
      entry({ id: "c", minutes: 60, status: "rejected", amountRub: null }),
      entry({ id: "d", objectId: "obj-2", minutes: 60, status: "pending", amountRub: 7 }),
      entry({ id: "n", minutes: 0, status: "pending", amountRub: null }),
    ];
    const result = recalcObject(entries, "obj-1", 30_000);
    expect(result.entries.find((e) => e.id === "a")!.amountRub).toBe(10_000);
    expect(result.entries.find((e) => e.id === "b")!.amountRub).toBe(10_000);
    expect(result.entries.find((e) => e.id === "c")!.amountRub).toBeNull();
    expect(result.entries.find((e) => e.id === "d")!.amountRub).toBe(7);
    // Без суммы остаётся без суммы: долю запись получит при подтверждении
    expect(result.entries.find((e) => e.id === "n")!.amountRub).toBeNull();
    expect(result.changed).toEqual([{ id: "b", from: 4_000, to: 10_000 }]);
    expect(result.confirmedMismatch).toEqual(["a"]);
  });
});

describe("норма против факта", () => {
  test("«норма 57,6 чел.-ч, факт 41,5 ч»", () => {
    const entries = [entry({ id: "a", minutes: 1_500 }), entry({ id: "b", minutes: 990 })];
    const n = normVsFact(57.644, entries, "obj-1");
    expect(fmtNormVsFact(n)).toBe("норма 57,6 чел.-ч, факт 41,5 ч");
    expect(n.percent).toBe(72);
    expect(fmtNormVsFact(normVsFact(null, entries, "obj-1"))).toBe("нормы нет, факт 41,5 ч");
  });
});

describe("подсказка привязки", () => {
  const objects = [
    { id: "o1", label: "Развилка, ул. Садовая, 12, ввод", code: "ОБ-101" },
    { id: "o2", label: "Ольховка, ул. Курская, 2, перемонтаж", code: "ОБ-102" },
  ];
  test("по словам имени файла, человек подтверждает", () => {
    expect(suggestObject("Перемонтаж Курская 2.xls", objects)).toBe("o2");
    expect(suggestObject("смета (7).xls", objects)).toBeNull();
  });
});

describe("регрессия отчёта до рубля", () => {
  /*
   * Итоги отчёта на демо-данных, снятые на main ccb4c61 до изменений ADR-053. Новые правила
   * не трогают записи, пока не подтверждена новая версия сметы, поэтому числа обязаны совпасть.
   */
  const seed = buildSeed();
  const totalOf = (entries: TimeEntry[], mode: "confirmed" | "preliminary") =>
    customerFormatRows({
      entries,
      groups: seed.groups,
      brigades: seed.brigades,
      employees: seed.employees,
      objects: seed.objects,
      frames: seed.frames,
      days: seed.week.days,
      mode,
    }).find((r) => r.kind === "total")!;

  test("утверждённый: 1 524 132 ₽, 21 685 мин, 4 217 ₽/ч", () => {
    const total = totalOf(seed.entries, "confirmed");
    expect(total.total).toEqual({ amountRub: 1_524_132, minutes: 21_685, revenue: 4_217 });
    expect(total.days.map((d) => d.amountRub)).toEqual([
      298_410, 239_235, 243_664, 292_538, 387_810, 62_475,
    ]);
  });

  test("предварительный: 1 618 632 ₽, 23 225 мин, 4 182 ₽/ч", () => {
    expect(totalOf(seed.entries, "preliminary").total).toEqual({
      amountRub: 1_618_632,
      minutes: 23_225,
      revenue: 4_182,
    });
  });

  test("пересчёт объекта стоимостью, равной сумме его записей, ничего не меняет в утверждённом", () => {
    const objectId = seed.entries.find(
      (e) => e.status === "confirmed" && e.amountRub !== null,
    )!.objectId;
    const own = seed.entries.filter((e) => e.objectId === objectId && e.status !== "rejected");
    const cost = own.reduce((a, e) => a + (e.amountRub ?? 0), 0);
    const result = recalcObject(seed.entries, objectId, cost);
    expect(totalOf(result.entries, "confirmed").total.amountRub).toBe(1_524_132);
  });
});
