import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import {
  effectiveMinutes,
  findOverlaps,
  hoursOfMinutes,
  revenuePerHour,
} from "@/domain/gas-ops/calc";
import { entryView } from "@/domain/gas-ops/view";
import { GAS_SHOW_HINT, isShowEntry } from "@/lib/gas-ops/show";

/**
 * Дефекты показа /gas (ADR-045, шаг V4; снимки владельца refs/01, 02, 10).
 * Правила расчёта не меняются: тесты фиксируют, что они верны, и что карточка получает
 * из домена всё, чтобы показать их честно.
 */
const seed = buildSeed();
const data = { ...seed, actorId: "u-manager" };
const byNumber = (number: string) => seed.entries.find((e) => e.number === number)!;

describe("метка «Нет подтверждённой стоимости»", () => {
  test("сумма из подтверждённой стоимости объекта — метки нет (вся демо-неделя)", () => {
    const fromEstimate = seed.entries
      .map((e) => entryView(data, e))
      .filter((v) => v.amountOrigin === "estimate");
    expect(fromEstimate.length).toBeGreaterThan(0);
    for (const view of fromEstimate) {
      expect(view.estimate?.status, view.entry.number).toBe("confirmed");
      expect(view.flags, view.entry.number).not.toContain("no-estimate");
    }
  });

  test("ГЗ-00097: сумма 14 700 ₽ из ручной стоимости, которая ждёт подтверждения", () => {
    const view = entryView(data, byNumber("ГЗ-00097"));
    expect(view.entry.amountRub).toBe(14_700);
    expect(view.estimate?.status).toBe("manual-pending");
    expect(view.amountOrigin).toBe("manual");
    // Метка верна: подтверждённой стоимости у объекта нет
    expect(view.flags).toContain("no-estimate");
  });
});

describe("пересечение времени только внутри одной бригады", () => {
  test("ГЗ-00097 пересекается с ГЗ-00098 той же бригады на 60 минут", () => {
    const view = entryView(data, byNumber("ГЗ-00097"));
    expect(view.flags).toContain("overlap");
    expect(view.overlaps).toEqual([
      { id: byNumber("ГЗ-00098").id, number: "ГЗ-00098", minutes: 60 },
    ]);
    expect(byNumber("ГЗ-00098").brigadeId).toBe(view.entry.brigadeId);
  });

  test("ГЗ-00095 другой бригады на том же объекте в то же время — не пересечение", () => {
    const a = byNumber("ГЗ-00095");
    const b = byNumber("ГЗ-00097");
    expect(a.objectId).toBe(b.objectId);
    expect(a.brigadeId).not.toBe(b.brigadeId);
    // Время накладывается: 08:10–11:40 и 09:00–13:00
    expect(
      Math.min(a.endMinutes!, b.endMinutes!) - Math.max(a.startMinutes!, b.startMinutes!),
    ).toBeGreaterThan(0);
    expect(findOverlaps([a, b])).toHaveLength(0);
    expect(entryView(data, a).overlaps).toEqual([]);
  });

  test("у каждого пересечения недели обе записи одной бригады и одного дня", () => {
    for (const o of findOverlaps(seed.entries)) {
      expect(o.a.brigadeId).toBe(o.b.brigadeId);
      expect(o.a.day).toBe(o.b.day);
    }
  });
});

describe("показ ведёт по записи зрителя", () => {
  test("шаг подтверждения засчитывает только запись из бота этой вкладки", () => {
    expect(isShowEntry({ gasEntryId: "gz-viewer" }, "gz-viewer")).toBe(true);
    // Подтверждённая заготовка (refs/10: ГЗ-00096) не подменяет запись зрителя
    expect(isShowEntry({ gasEntryId: "gz-viewer" }, "mk-2")).toBe(false);
    // Записи зрителя ещё нет — заготовка шаг не засчитывает
    expect(isShowEntry({}, "mk-2")).toBe(false);
  });

  test("ОБ-200: 12:00–14:30 без перерыва = 150 мин = 2,50 ч, 14 700 ₽, 5 880 ₽/ч", () => {
    const estimate = seed.estimates.find((e) => e.objectId === GAS_SHOW_HINT.objectId)!;
    expect(estimate.status).toBe("confirmed");
    expect(estimate.amountRub).toBe(14_700);
    const result = effectiveMinutes({
      start: GAS_SHOW_HINT.start,
      end: GAS_SHOW_HINT.end,
      breakMinutes: GAS_SHOW_HINT.breakMinutes,
    });
    if (!result.ok) throw new Error("время сценария не посчиталось");
    const minutes = result.minutes;
    expect(minutes).toBe(150);
    expect(hoursOfMinutes(minutes)).toBe(2.5);
    expect(revenuePerHour(estimate.amountRub, minutes)).toBe(5_880);
  });
});
