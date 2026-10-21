import { describe, expect, test } from "bun:test";
import { ESTIMATE_SAMPLES, workCostCandidate } from "@/lib/gas-ops/estimate-samples";

/** Примеры разбора смет (ADR-045, 1.3 и 5.10): числа документа владельца и кандидат стоимости */
describe("примеры смет заказчика", () => {
  test("кандидат «без НДС минус материалы»: ГРАНД-Смета 165 455,23 ₽", () => {
    expect(workCostCandidate(ESTIMATE_SAMPLES.grand)).toBe(165_455.23);
  });
  test("кандидат «без НДС минус материалы»: ресурсная 73 468,66 ₽", () => {
    expect(workCostCandidate(ESTIMATE_SAMPLES.resource)).toBe(73_468.66);
  });
  test("итоги сходятся: без НДС плюс НДС равно всего по смете", () => {
    for (const sample of Object.values(ESTIMATE_SAMPLES)) {
      const vat = sample.totals.find((t) => t.label.startsWith("НДС"))!.value;
      const all = sample.totals.find((t) => t.label === "ВСЕГО по смете")!.value;
      expect(Math.round((sample.withoutVat + vat) * 100)).toBe(Math.round(all * 100));
    }
  });
});
