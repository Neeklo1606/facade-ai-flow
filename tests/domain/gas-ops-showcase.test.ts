import { describe, expect, test } from "bun:test";
import { contourOf, publicContour } from "@/lib/gas-ops/contour";
import { getServerSnapshotFor } from "@/adapters/gas-ops/state";
import { customerContour } from "@/server/customer-data";
import { closeReasons, coverage, expectations } from "@/domain/gas-ops/week";
import { findOverlaps } from "@/domain/gas-ops/calc";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

/** Демо-неделя для показа (ADR-062, F5): публичный контур здоровый, личный не тронут */

function week(data: GasOpsSnapshot) {
  const days = data.week.days;
  const expected = expectations({
    days,
    brigades: data.brigades,
    objects: data.objects,
    schedule: data.schedule,
    assignments: data.assignments,
  });
  const cov = coverage(expected, data.entries);
  const reasons = closeReasons({
    days,
    entries: data.entries,
    estimates: data.estimates,
    objects: data.objects,
    brigades: data.brigades,
    crew: data.crew,
    finalChecks: data.finalChecks,
    missing: cov.missing,
  });
  return { cov, reasons };
}

describe("демо-неделя публичного контура", () => {
  const data = getServerSnapshotFor(publicContour);
  const { cov, reasons } = week(data);

  test("получено 25 из 28, без записи три ожидания, одно из них — бригады показа", () => {
    expect([cov.received, cov.expected]).toEqual([25, 28]);
    expect(cov.missing.map((m) => m.brigadeId)).toContain("brg-1");
  });

  test("замечания 3–5 разных типов помимо «Нет записи»", () => {
    const kinds = new Set(reasons.filter((r) => r.kind !== "missing").map((r) => r.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(kinds.size).toBeLessThanOrEqual(5);
  });

  test("10 объектов с подтверждённой сметой и версией, правило подтверждено", () => {
    const confirmed = data.estimates.filter((e) => e.status === "confirmed");
    expect(confirmed).toHaveLength(10);
    for (const e of confirmed) {
      const v = data.estimateVersions.find((x) => x.objectId === e.objectId && x.confirmedAt);
      expect(v, e.objectId).toBeDefined();
      // Стоимость = без НДС минус материалы, до рубля
      expect((v!.totals.withoutVat!.kopecks - v!.totals.materials!.kopecks) / 100).toBe(
        e.amountRub,
      );
    }
    expect(data.costRules).toHaveLength(1);
    expect(data.costRules[0]?.status).toBe("confirmed");
  });

  test("добавленные записи — демо, проверены, со стоимостью и без новых пересечений", () => {
    const added = data.entries.filter((e) => e.id.startsWith("sc-"));
    expect(added.length).toBe(16);
    for (const e of added) {
      expect(e.source).toBe("mock");
      expect(e.status).toBe("confirmed");
      expect(e.amountRub).not.toBeNull();
      expect(e.endMinutes!).toBeLessThanOrEqual(19 * 60);
    }
    const numbers = data.entries.map((e) => e.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    const overlaps = findOverlaps(data.entries.filter((e) => e.day === data.today));
    expect(overlaps.some((o) => o.a.id.startsWith("sc-") || o.b.id.startsWith("sc-"))).toBe(false);
  });

  test("бригада показа без изменений: окно 12:00–15:00 свободно", () => {
    expect(data.entries.filter((e) => e.brigadeId === "brg-1" && e.id.startsWith("sc-"))).toEqual(
      [],
    );
  });
});

describe("личный контур заказчика", () => {
  test("демо-неделя не применяется: данные заказчика как в отчёте", () => {
    const data = getServerSnapshotFor(contourOf(customerContour()));
    expect(data.entries.some((e) => e.id.startsWith("sc-"))).toBe(false);
    expect(data.estimateVersions).toEqual([]);
    expect(data.costRules[0]?.status).toBe("needs-agreement");
  });
});
