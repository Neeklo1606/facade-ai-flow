import { describe, expect, test } from "bun:test";
import { buildSeed, GAS_TODAY } from "@/data/mock/gas-ops-seed";
import { effectiveMinutes, hoursOfMinutes, revenuePerHour } from "@/domain/gas-ops/calc";
import { allowedObjectIdsFor, busyIntervals, clashOf, dayObjects } from "@/domain/gas-ops/view";
import { GAS_SHOW_HINT } from "@/lib/gas-ops/show";

/**
 * Рабочий контур и показ газа (ADR-044): правило разрешённых объектов бригадира, назначения
 * «на сегодня», занятые интервалы и цифры сценария показа. Числа сценария считаются кодом.
 */
const seed = buildSeed();
const data = { ...seed, actorId: "u-foreman-1" };
const foreman = seed.users.find((u) => u.id === "u-foreman-1")!;

describe("разрешённые объекты бригадира", () => {
  test("бригадир видит объекты своей бригады, а не весь справочник", () => {
    const allowed = allowedObjectIdsFor(data, foreman);
    expect(allowed).not.toBe("all");
    if (allowed === "all") return;
    expect(allowed.size).toBeGreaterThan(0);
    expect(allowed.size).toBeLessThan(seed.objects.length);
    const worked = seed.entries.filter((e) => e.brigadeId === "brg-1").map((e) => e.objectId);
    for (const id of worked) expect(allowed.has(id)).toBe(true);
  });

  test("назначение на день разрешает объект, даже если по нему ещё не работали", () => {
    const allowed = allowedObjectIdsFor(data, foreman);
    if (allowed === "all") throw new Error("ожидался список");
    expect(seed.entries.some((e) => e.objectId === "obj-m200")).toBe(false);
    expect(allowed.has("obj-m200")).toBe(true);
  });

  test("менеджер и руководитель вводят по любому объекту", () => {
    for (const role of ["manager", "admin", "director"] as const) {
      const user = seed.users.find((u) => u.role === role)!;
      expect(allowedObjectIdsFor(data, user)).toBe("all");
    }
  });

  test("у каждой бригады на сегодня 2–5 объектов, у Бригады 1 среди них ОБ-200", () => {
    for (const brigade of seed.brigades) {
      const list = dayObjects(seed, brigade.id, GAS_TODAY);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.length).toBeLessThanOrEqual(5);
    }
    expect(dayObjects(seed, "brg-1", GAS_TODAY).map((o) => o.code)).toContain("ОБ-200");
    expect(seed.assignments.every((a) => a.source === "mock")).toBe(true);
  });
});

describe("занятые интервалы", () => {
  test("у Бригады 1 сегодня свободно 12:00–15:00", () => {
    const busy = busyIntervals(seed, "brg-1", GAS_TODAY);
    expect(clashOf(busy, 12 * 60, 15 * 60)).toBeNull();
  });

  test("ввод 08:30–11:40 сразу находит пересечение с утренней записью", () => {
    const busy = busyIntervals(seed, "brg-1", GAS_TODAY);
    const clash = clashOf(busy, 8 * 60 + 30, 11 * 60 + 40);
    expect(clash).not.toBeNull();
    expect(clash?.number).toMatch(/^ГЗ-\d{5}$/);
  });

  test("отклонённая запись время не занимает", () => {
    const rejected = seed.entries.find((e) => e.status === "rejected")!;
    const busy = busyIntervals(seed, rejected.brigadeId, rejected.day);
    expect(busy.some((b) => b.id === rejected.id)).toBe(false);
  });
});

describe("цифры показа", () => {
  test("12:00–14:30 без перерыва: 150 мин, 2,50 ч, 14 700 ₽, 5 880 ₽/ч", () => {
    const result = effectiveMinutes({
      start: GAS_SHOW_HINT.start,
      end: GAS_SHOW_HINT.end,
      breakMinutes: GAS_SHOW_HINT.breakMinutes,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.minutes).toBe(150);
    expect(hoursOfMinutes(result.minutes)).toBe(2.5);
    const estimate = seed.estimates.find((e) => e.objectId === GAS_SHOW_HINT.objectId)!;
    expect(estimate.status).toBe("confirmed");
    expect(estimate.amountRub).toBe(14_700);
    expect(revenuePerHour(estimate.amountRub, result.minutes)).toBe(5_880);
  });
});
