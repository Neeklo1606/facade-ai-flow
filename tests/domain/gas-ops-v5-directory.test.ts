import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { resetState } from "@/adapters/gas-ops/state";
import { GasOpsError } from "@/ports/gas-ops";
import { parseEstimateGrid } from "@/domain/gas-ops/estimate-parse";
import { correctionOf, correctVersion } from "@/domain/gas-ops/work-cost";
import { estimateVersionView } from "@/api/gas-estimates";

/**
 * Справочники «Газ v5» (ADR-066): правка значений сметы до подтверждения с основанием и
 * бригада, добавленная вручную. Правила в порту: экран показывает только текст отказа.
 */
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

/** Смета 14 граф: без НДС 80 000,91, материалы 30 000,25 — стоимость работ 50 001 ₽ */
function resourceGrid() {
  const grid: (string | null)[][] = [];
  const put = (row: number, cols: Record<number, string>) => {
    grid[row - 1] = Array.from({ length: 13 }, (_, i) => cols[i] ?? null);
  };
  put(22, { 7: "общая", 12: "Т/з осн. раб." });
  put(23, { 8: "Осн.З/п", 9: "Эк.Маш.", 10: "З/пМех", 11: "Мат" });
  put(154, { 0: " Итого по разделу 3 Монтаж", 7: "80000,91" });
  put(181, { 0: "Итоги по смете:" });
  put(182, { 0: " Итого", 7: "80000,91", 12: "40,125" });
  put(184, { 0: " Материалы", 7: "30000,25" });
  put(189, { 0: " НДС 5%", 7: "4000,05" });
  put(190, { 0: " ВСЕГО по смете", 7: "84000,96" });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
}

async function uploaded() {
  const s = await port.snapshot();
  const parsed = { ...parseEstimateGrid(resourceGrid()), sheet: "Смета" };
  return port.addEstimateVersion({ parsed, fileName: "с.xls", objectId: s.objects[0]!.id });
}

describe("правка значений сметы", () => {
  test("договорились снизить материалы: стоимость работ растёт, «было» и основание в версии", async () => {
    const v = await uploaded();
    const rule = (await port.snapshot()).costRules.find((r) => r.objectId === null)!;
    expect(estimateVersionView(v, rule).costRub).toBe(50_001);

    const next = await port.correctEstimateValue({
      id: v.id,
      target: { kind: "total", key: "materials" },
      kopecks: 25_000_00,
      note: "Согласовано с заказчиком 03.10: материалы его",
    });
    expect(next.totals.materials?.kopecks).toBe(25_000_00);
    expect(estimateVersionView(next, rule).costRub).toBe(55_001);
    const fix = correctionOf(next, { kind: "total", key: "materials" })!;
    expect(fix.fromKopecks).toBe(30_000_25);
    expect(fix.note).toContain("Согласовано");

    // Вторая правка той же строки помнит исходник файла, а не прошлую правку
    const again = await port.correctEstimateValue({
      id: v.id,
      target: { kind: "total", key: "materials" },
      kopecks: 20_000_00,
      note: "Уточнили по телефону",
    });
    expect(correctionOf(again, { kind: "total", key: "materials" })!.fromKopecks).toBe(30_000_25);

    const audit = (await port.snapshot()).audit.find((a) => a.action === "estimate.corrected")!;
    expect(audit.detail).toContain("Материалы");
    expect(audit.detail).toContain("Основание");
  });

  test("без основания, отрицательной суммой и после подтверждения правка не проходит", async () => {
    const v = await uploaded();
    const target = { kind: "total", key: "materials" } as const;
    expect(
      await errorCode(() => port.correctEstimateValue({ id: v.id, target, kopecks: 1, note: " " })),
    ).toBe("comment-required");
    expect(
      await errorCode(() =>
        port.correctEstimateValue({ id: v.id, target, kopecks: -5, note: "так" }),
      ),
    ).toBe("comment-required");
    await port.confirmEstimateVersion(v.id);
    expect(
      await errorCode(() =>
        port.correctEstimateValue({ id: v.id, target, kopecks: 100, note: "поздно" }),
      ),
    ).toBe("comment-required");
  });

  test("раздел правится по строке файла, несуществующая строка отклоняется", () => {
    const parsed = parseEstimateGrid(resourceGrid());
    const v = {
      id: "v",
      objectId: null,
      version: 1,
      fileName: "x",
      sheet: null,
      uploadedAt: "2026-10-03T10:00:00",
      uploadedBy: "u",
      format: parsed.format,
      parseStatus: parsed.status,
      totals: parsed.totals,
      vatRate: null,
      laborHours: null,
      sections: parsed.sections,
      issues: [],
      issuesReviewedBy: null,
      confirmedBy: null,
      confirmedAt: null,
    };
    const row = parsed.sections[0]!.row;
    const ok = correctVersion(
      v,
      { target: { kind: "section", row }, kopecks: 100, note: "н" },
      "u",
      "t",
    );
    expect(ok.ok).toBe(true);
    const bad = correctVersion(
      v,
      { target: { kind: "section", row: 9999 }, kopecks: 100, note: "н" },
      "u",
      "t",
    );
    expect(bad.ok).toBe(false);
  });

  test("руководитель смету не правит", async () => {
    const v = await uploaded();
    await port.signIn("u-director");
    expect(
      await errorCode(() =>
        port.correctEstimateValue({
          id: v.id,
          target: { kind: "total", key: "materials" },
          kopecks: 1,
          note: "так",
        }),
      ),
    ).toBe("not-allowed");
  });
});

describe("бригада вручную", () => {
  test("добавляется с кодом по порядку, видна в справочнике и журнале", async () => {
    const s = await port.snapshot();
    const brigade = await port.addBrigade({
      name: "Бригада 9",
      groupId: s.groups[0]!.id,
      phone: " +7 900 000-00-00 ",
    });
    expect(brigade.code).toMatch(/^Б-\d+$/);
    expect(brigade.phone).toBe("+7 900 000-00-00");
    const after = await port.snapshot();
    expect(after.brigades.some((b) => b.id === brigade.id)).toBe(true);
    expect(after.audit[0]?.action).toBe("brigade.add");
    // Состав добавляется сразу в новую бригаду
    const member = await port.addCrewMember({
      brigadeId: brigade.id,
      name: "Монтажник 1",
      from: after.week.days[0]!,
    });
    expect(member.brigadeId).toBe(brigade.id);
  });

  test("повтор названия, пустое название и чужое подразделение отклоняются", async () => {
    const s = await port.snapshot();
    const groupId = s.groups[0]!.id;
    const existing = s.brigades[0]!.name;
    expect(
      await errorCode(() =>
        port.addBrigade({ name: existing.toUpperCase(), groupId, phone: null }),
      ),
    ).toBe("duplicate");
    expect(await errorCode(() => port.addBrigade({ name: "  ", groupId, phone: null }))).toBe(
      "comment-required",
    );
    expect(
      await errorCode(() => port.addBrigade({ name: "Новая", groupId: "нет", phone: null })),
    ).toBe("not-found");
  });

  test("руководитель бригаду не добавляет", async () => {
    const s = await port.snapshot();
    await port.signIn("u-director");
    expect(
      await errorCode(() => port.addBrigade({ name: "Х", groupId: s.groups[0]!.id, phone: null })),
    ).toBe("not-allowed");
  });
});
