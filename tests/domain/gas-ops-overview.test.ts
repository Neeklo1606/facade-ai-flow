import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { overviewOf } from "@/api/gas-overview";
import type { GasData } from "@/domain/gas-ops/view";

/** Обзор (ADR-052): числа из расчёта, части сходятся с целым */
const seed = buildSeed();
const data: GasData = { ...seed, actorId: "u-director" };
/** Разряды в ru-RU разделяет неразрывный пробел: в ожиданиях пишем обычный */
const plain = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");

describe("обзор недели", () => {
  const o = overviewOf(data);

  test("сумма по дням равна начисленному, итог как в отчёте", () => {
    expect(o.days.reduce((a, d) => a + d.value, 0)).toBe(o.totalAmountRub);
    expect(o.totalAmountRub).toBe(1_524_132);
    expect(plain(o.kpis.amount.value)).toBe("1 524 132 ₽");
  });

  test("статусы складываются во все записи", () => {
    expect(o.statuses.reduce((a, s) => a + s.value, 0)).toBe(o.statusTotal);
    expect(o.statusTotal).toBe(seed.entries.length);
  });

  test("стоимость работ: каждый объект ровно в одной части", () => {
    expect(o.costs.reduce((a, c) => a + c.value, 0)).toBe(seed.objects.length);
  });

  test("бригады по убыванию начисления, не больше шести", () => {
    expect(o.brigades.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < o.brigades.length; i++)
      expect(o.brigades[i - 1]!.value).toBeGreaterThanOrEqual(o.brigades[i]!.value);
  });

  test("лучший день назван словами с суммой", () => {
    expect(plain(o.bestDay)).toBe("Пт 02.10: 387 810 ₽");
  });
});
