import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { resetState } from "@/adapters/gas-ops/state";
import { GasOpsError } from "@/ports/gas-ops";
import { parseEstimateGrid } from "@/domain/gas-ops/estimate-parse";
import {
  DEFAULT_COMPANY_RULE,
  applyRule,
  extraKey,
  revertRule,
  reviseRule,
  ruleExample,
  ruleFormula,
  ruleHistory,
  termChoices,
  validateTerms,
  type CostRuleTerm,
} from "@/domain/gas-ops/work-cost";

/**
 * Конструктор правила стоимости (ADR-062, F2) и строки ниже «ВСЕГО» (F4): домен и порт.
 * Смета синтетическая: числа примера, а не файл заказчика.
 */

const totals = {
  withoutVat: { kopecks: 8_000_091, row: 182 },
  materials: { kopecks: 3_000_025, row: 184 },
  total: { kopecks: 8_400_096, row: 190 },
};
const extras = [{ label: "Технадзор", kopecks: 600_051, row: 191 }];

describe("правило: домен", () => {
  test("слагаемое ниже «ВСЕГО» по подписи, без учёта регистра и пробелов", () => {
    const terms: CostRuleTerm[] = [
      { key: "withoutVat", sign: 1 },
      { key: extraKey(" технадзор "), sign: 1 },
      { key: "materials", sign: -1 },
    ];
    expect(applyRule(totals, terms, extras)).toEqual({
      ok: true,
      kopecks: 8_000_091 + 600_051 - 3_000_025,
    });
    expect(ruleFormula(terms)).toBe("Всего без НДС плюс технадзор минус материалы");
  });

  test("нет строки в смете — нет числа, а не ноль; пример помечает строку", () => {
    const terms: CostRuleTerm[] = [
      { key: "withoutVat", sign: 1 },
      { key: "overhead", sign: -1 },
    ];
    expect(applyRule(totals, terms)).toEqual({ ok: false, missing: ["overhead"] });
    const example = ruleExample({ totals, extras }, terms);
    expect(example.terms.map((t) => t.source?.row ?? null)).toEqual([182, null]);
    expect(example.result.ok).toBe(false);
  });

  test("выбор: итоги по порядку и строки ниже «ВСЕГО» сметы примера", () => {
    const keys = termChoices(extras, DEFAULT_COMPANY_RULE.terms);
    expect(keys.slice(0, 8)).toEqual([
      "direct",
      "materials",
      "payroll",
      "overhead",
      "profit",
      "withoutVat",
      "vat",
      "total",
    ]);
    expect(keys).toContain(extraKey("Технадзор"));
  });

  test("проверка состава: пусто, без плюса, повтор", () => {
    expect(validateTerms([])).not.toBeNull();
    expect(validateTerms([{ key: "materials", sign: -1 }])).not.toBeNull();
    expect(
      validateTerms([
        { key: "total", sign: 1 },
        { key: "total", sign: -1 },
      ]),
    ).not.toBeNull();
    expect(validateTerms(DEFAULT_COMPANY_RULE.terms)).toBeNull();
  });

  test("редакция: требует согласования, история растёт, отмена возвращает прежнюю", () => {
    const next = reviseRule(
      DEFAULT_COMPANY_RULE,
      { objectId: null, terms: [{ key: "total", sign: 1 }] },
      "u-manager",
      "2026-10-03T10:00:00",
    );
    expect(next.status).toBe("needs-agreement");
    expect(next.revision).toBe(2);
    expect(ruleHistory(next).map((r) => r.savedBy)).toEqual([null, "u-manager"]);
    expect(revertRule(next)?.terms).toEqual(DEFAULT_COMPANY_RULE.terms);
    const own = reviseRule(
      null,
      { objectId: "obj-1", terms: [{ key: "total", sign: 1 }] },
      "u-manager",
      "2026-10-03T10:00:00",
    );
    expect(own.revision).toBe(1);
    expect(revertRule(own)).toBeNull();
  });
});

/* ---------------------------------------------------------------- Порт */

const port = createGasOpsDemo();

beforeEach(async () => {
  resetState();
  await port.signIn("u-manager");
});

async function errorCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof GasOpsError ? error.code : "unknown";
  }
}

/** Ресурсная смета с «Технадзором» ниже «ВСЕГО» */
function grid() {
  const rows: (string | null)[][] = [];
  const put = (row: number, cols: Record<number, string>) => {
    rows[row - 1] = Array.from({ length: 13 }, (_, i) => cols[i] ?? null);
  };
  put(22, { 7: "общая", 12: "Т/з осн. раб." });
  put(23, { 8: "Осн.З/п", 9: "Эк.Маш.", 10: "З/пМех", 11: "Мат" });
  put(154, { 0: " Итого по разделу 3 Монтаж", 7: "80000,91" });
  put(181, { 0: "Итоги по смете:" });
  put(182, { 0: " Итого", 7: "80000,91", 12: "40,125" });
  put(184, { 0: " Материалы", 7: "30000,25" });
  put(189, { 0: " НДС 5%", 7: "4000,05" });
  put(190, { 0: " ВСЕГО по смете", 7: "84000,96" });
  put(191, { 0: " Технадзор", 7: "6000,51" });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return rows;
}

/** Подтверждённая смета на объекте с записями недели */
async function confirmedObject() {
  const s = await port.snapshot();
  const objectId = s.entries.find((e) => e.status !== "rejected")!.objectId;
  const parsed = { ...parseEstimateGrid(grid()), sheet: "Смета" };
  expect(parsed.extras).toEqual([{ label: "Технадзор", kopecks: 600_051, row: 191 }]);
  const v = await port.addEstimateVersion({ parsed, fileName: "пример.xls", objectId });
  await port.reviewEstimateIssues(v.id);
  const confirmed = await port.confirmEstimateVersion(v.id);
  expect(confirmed.estimate.amountRub).toBe(50_001);
  return objectId;
}

describe("правило: порт", () => {
  test("редакция компании пересчитывает стоимость, отмена возвращает", async () => {
    const objectId = await confirmedObject();
    const before = await port.snapshot();
    const change = await port.saveCostRule({
      objectId: null,
      terms: [
        { key: "withoutVat", sign: 1 },
        { key: extraKey("Технадзор"), sign: 1 },
        { key: "materials", sign: -1 },
      ],
    });
    expect(change.rule?.status).toBe("needs-agreement");
    expect(change.rule?.revision).toBe(2);
    expect(change.changedObjects).toBeGreaterThanOrEqual(1);
    const after = await port.snapshot();
    expect(after.estimates.find((e) => e.objectId === objectId)?.amountRub).toBe(56_001);
    const moved = after.entries.filter(
      (e, i) => e.amountRub !== before.entries[i]?.amountRub,
    ).length;
    expect(change.changedEntries).toBe(moved);
    expect(after.audit[0]?.action).toBe("cost-rule.save");

    const undone = await port.undoCostRule({ objectId: null, revision: 2 });
    expect(undone.rule?.revision).toBe(1);
    const back = await port.snapshot();
    expect(back.estimates.find((e) => e.objectId === objectId)?.amountRub).toBe(50_001);
    expect(back.entries.map((e) => e.amountRub)).toEqual(before.entries.map((e) => e.amountRub));
    expect(await errorCode(() => port.undoCostRule({ objectId: null, revision: 2 }))).toBe(
      "nothing-to-undo",
    );
  });

  test("своё правило объекта меняет только его; нет строки — стоимость не трогается", async () => {
    const objectId = await confirmedObject();
    const own = await port.saveCostRule({ objectId, terms: [{ key: "total", sign: 1 }] });
    expect(own.rule?.objectId).toBe(objectId);
    let s = await port.snapshot();
    expect(s.estimates.find((e) => e.objectId === objectId)?.amountRub).toBe(84_001);
    expect(s.costRules.find((r) => r.objectId === null)?.terms).toEqual(DEFAULT_COMPANY_RULE.terms);
    const missing = await port.saveCostRule({ objectId, terms: [{ key: "overhead", sign: 1 }] });
    expect(missing.missingObjects).toBe(1);
    s = await port.snapshot();
    expect(s.estimates.find((e) => e.objectId === objectId)?.amountRub).toBe(84_001);
  });

  test("подтверждает менеджер ту редакцию, что видел; руководитель правило не меняет", async () => {
    await port.saveCostRule({ objectId: null, terms: [{ key: "total", sign: 1 }] });
    expect(
      await errorCode(() =>
        port.confirmCostRule({ objectId: null, terms: DEFAULT_COMPANY_RULE.terms }),
      ),
    ).toBe("rule-changed");
    const rule = await port.confirmCostRule({ objectId: null, terms: [{ key: "total", sign: 1 }] });
    expect(rule.status).toBe("confirmed");
    expect(ruleHistory(rule).at(-1)?.confirmedBy).toBe("u-manager");
    expect(
      await errorCode(() =>
        port.saveCostRule({ objectId: null, terms: [{ key: "total", sign: 1 }] }),
      ),
    ).toBe("rule-invalid");
    await port.signIn("u-director");
    expect(
      await errorCode(() =>
        port.saveCostRule({ objectId: null, terms: [{ key: "vat", sign: 1 }] }),
      ),
    ).toBe("not-allowed");
  });
});

describe("правило: кто подтверждает (решение владельца 1)", () => {
  const terms: CostRuleTerm[] = [{ key: "total", sign: 1 }];

  test("по умолчанию автор подтверждает сам, история и журнал это называют", async () => {
    expect((await port.snapshot()).reviewSettings.secondRuleApprover ?? false).toBe(false);
    await port.saveCostRule({ objectId: null, terms });
    const rule = await port.confirmCostRule({ objectId: null, terms });
    const last = ruleHistory(rule).at(-1)!;
    expect(last.savedBy).toBe("u-manager");
    expect(last.confirmedBy).toBe("u-manager");
    expect((await port.snapshot()).audit[0]?.detail).toContain(
      "сохранил и подтвердил один человек",
    );
  });

  test("настройка «второй человек»: автору отказ, другой подтверждает", async () => {
    const s = await port.snapshot();
    await port.setReviewSettings({
      mode: s.reviewSettings.mode,
      thresholdPercent: s.reviewSettings.thresholdPercent,
      secondRuleApprover: true,
    });
    await port.saveCostRule({ objectId: null, terms });
    expect(await errorCode(() => port.confirmCostRule({ objectId: null, terms }))).toBe(
      "same-person",
    );
    await port.signIn("u-admin");
    const rule = await port.confirmCostRule({ objectId: null, terms });
    expect(ruleHistory(rule).at(-1)?.confirmedBy).toBe("u-admin");
    expect((await port.snapshot()).audit[0]?.detail).not.toContain("один человек");
    // Смена режима без поля настройку не сбрасывает
    await port.setReviewSettings({ mode: "all", thresholdPercent: 95 });
    expect((await port.snapshot()).reviewSettings.secondRuleApprover).toBe(true);
  });
});

describe("«Вернуть правило компании» (решение владельца 2)", () => {
  test("своё правило снято, стоимость по правилу компании, запись в журнале", async () => {
    const objectId = await confirmedObject();
    await port.saveCostRule({ objectId, terms: [{ key: "total", sign: 1 }] });
    expect((await port.snapshot()).estimates.find((e) => e.objectId === objectId)?.amountRub).toBe(
      84_001,
    );
    const change = await port.resetObjectRule({ objectId });
    expect(change.rule).toBeNull();
    const s = await port.snapshot();
    expect(s.costRules.some((r) => r.objectId === objectId)).toBe(false);
    expect(s.estimates.find((e) => e.objectId === objectId)?.amountRub).toBe(50_001);
    expect(s.audit[0]?.action).toBe("cost-rule.reset");
    expect(await errorCode(() => port.resetObjectRule({ objectId }))).toBe("nothing-to-undo");
  });
});

describe("F4: записи с фактом получают стоимость при подтверждении сметы", () => {
  test("проверенная до сметы запись без суммы получает долю, тост объясняет", async () => {
    const s = await port.snapshot();
    const day = s.week.days[0]!;
    const brigadeId = s.brigades[0]!.id;
    // У всех демо-объектов есть записи или стоимость: новый объект без сметы
    const objectId = (
      await port.addObject({ label: "ул. Демо, 400", code: "ОБ-400", workType: null })
    ).id;
    const entry = await port.createEntry({
      day,
      brigadeId,
      employeeId: null,
      objectId,
      start: "5:00",
      end: "6:00",
      breakMinutes: 0,
      submit: true,
    });
    const reviewed = await port.review({ id: entry.id, action: "confirm" });
    expect(reviewed.status).toBe("confirmed");
    expect(reviewed.amountRub).toBeNull();

    const parsed = { ...parseEstimateGrid(grid()), sheet: "Смета" };
    const v = await port.addEstimateVersion({ parsed, fileName: "пример.xls", objectId });
    await port.reviewEstimateIssues(v.id);
    const result = await port.confirmEstimateVersion(v.id);
    expect(result.changedEntries).toBe(1);
    const after = await port.snapshot();
    expect(after.entries.find((e) => e.id === entry.id)?.amountRub).toBe(50_001);
  });
});
