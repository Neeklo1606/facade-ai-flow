import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { resetState } from "@/adapters/gas-ops/state";
import { GasOpsError } from "@/ports/gas-ops";
import { parseEstimateGrid } from "@/domain/gas-ops/estimate-parse";

/**
 * Сметы, режимы проверки, итоговая проверка и сдача отчёта через порт (ADR-053). Те же
 * правила будет отдавать сервер: экран только показывает текст ошибки.
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

/** Смета 14 граф: без НДС 142 174,91, материалы 68 706,25 — стоимость работ 73 469 ₽ */
const resourceGrid = () => {
  const grid: (string | null)[][] = [];
  const put = (row: number, cols: Record<number, string>) => {
    grid[row - 1] = Array.from({ length: 13 }, (_, i) => cols[i] ?? null);
  };
  put(22, { 7: "общая", 12: "Т/з осн. раб." });
  put(23, { 8: "Осн.З/п", 9: "Эк.Маш.", 10: "З/пМех", 11: "Мат" });
  put(154, { 0: " Итого по разделу 3 Монтаж", 7: "142174,91" });
  put(181, { 0: "Итоги по смете:" });
  put(182, { 0: " Итого", 7: "142174,91", 12: "57,644" });
  put(184, { 0: " Материалы", 7: "68706,25" });
  put(189, { 0: " НДС 5%", 7: "7108,75" });
  put(190, { 0: " ВСЕГО по смете", 7: "149283,66" });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
};

async function freeSlot() {
  const s = await port.snapshot();
  const day = s.week.days[0]!;
  const brigade = s.brigades[0]!;
  const used = new Set(
    s.entries.filter((e) => e.day === day && e.brigadeId === brigade.id).map((e) => e.objectId),
  );
  const object = s.objects.find((o) => !used.has(o.id))!;
  return { day, brigadeId: brigade.id, objectId: object.id };
}

describe("версия сметы", () => {
  test("загрузка, привязка, подтверждение: стоимость по правилу и запись в журнал", async () => {
    const parsed = { ...parseEstimateGrid(resourceGrid()), sheet: "Смета" };
    expect(parsed.status).toBe("parsed");
    const v = await port.addEstimateVersion({ parsed, fileName: "смета.xls", objectId: null });
    expect(await errorCode(() => port.confirmEstimateVersion(v.id))).toBe("estimate-not-ready");
    const { objectId } = await freeSlot();
    await port.linkEstimateVersion({ id: v.id, objectId });
    const result = await port.confirmEstimateVersion(v.id);
    expect(result.estimate.amountRub).toBe(73_469);
    expect(result.estimate.origin).toBe("estimate");
    expect(result.estimate.note).toContain("Всего без НДС минус материалы");
    const s = await port.snapshot();
    expect(s.audit[0]?.action).toBe("estimate.confirm");
    // В журнале нет имени файла: в именах смет адреса объектов
    expect(s.audit.some((a) => a.detail.includes("смета.xls"))).toBe(false);
  });

  test("смета с замечаниями не подтверждается, пока сметчик не отметил их проверенными", async () => {
    const grid = resourceGrid();
    grid[190] = [null, null, null, null, null, null, "Технадзор", "11875.51"];
    const parsed = { ...parseEstimateGrid(grid), sheet: "Смета" };
    expect(parsed.status).toBe("needs-review");
    const { objectId } = await freeSlot();
    const v = await port.addEstimateVersion({ parsed, fileName: "с.xls", objectId });
    expect(await errorCode(() => port.confirmEstimateVersion(v.id))).toBe("estimate-not-ready");
    await port.reviewEstimateIssues(v.id);
    expect((await port.confirmEstimateVersion(v.id)).estimate.amountRub).toBe(73_469);
  });

  test("бригадир и руководитель смету не загружают", async () => {
    await port.signIn("u-director");
    const parsed = { ...parseEstimateGrid(resourceGrid()), sheet: "Смета" };
    expect(
      await errorCode(() => port.addEstimateVersion({ parsed, fileName: "x", objectId: null })),
    ).toBe("not-allowed");
  });
});

describe("режимы проверки и итоговая проверка", () => {
  test("«только с замечаниями»: запись без признаков подтверждается сама долей стоимости", async () => {
    const slot = await freeSlot();
    await port.setEstimate({ objectId: slot.objectId, amountRub: 9_000, note: "договор" });
    await port.setReviewSettings({ mode: "flagged", thresholdPercent: 95 });
    const entry = await port.createEntry({
      ...slot,
      employeeId: null,
      start: "5:00",
      end: "6:00",
      breakMinutes: 0,
      submit: true,
    });
    expect(entry.status).toBe("confirmed");
    expect(entry.reviewedBy).toBe("auto");
    expect(entry.amountRub).not.toBeNull();

    // Сдача отчёта без итоговой проверки — отказ
    expect(await errorCode(() => port.issueReport())).toBe("final-check-required");
    const check = await port.finalCheck();
    expect(check.entryIds).toContain(entry.id);
    const report = await port.issueReport();
    expect(report.stale).toBe(false);
    expect(report.objectIds).toContain(slot.objectId);

    // Новая стоимость объекта: сданный отчёт молча не меняется, а помечается
    await port.setEstimate({ objectId: slot.objectId, amountRub: 9_500, note: "допсоглашение" });
    const after = await port.snapshot();
    expect(after.reportIssues[0]?.stale).toBe(true);
    expect(after.reportIssues[0]?.totalRub).toBe(report.totalRub);
    // Подтверждённая запись тоже не поменялась
    expect(after.entries.find((e) => e.id === entry.id)?.amountRub).toBe(entry.amountRub);
  });

  test("«проверять все»: запись ждёт менеджера", async () => {
    const slot = await freeSlot();
    const entry = await port.createEntry({
      ...slot,
      employeeId: null,
      start: "5:00",
      end: "6:00",
      breakMinutes: 0,
      submit: true,
    });
    expect(entry.status).toBe("pending");
  });

  test("режим без проверки недоступен без набранной точности", async () => {
    expect(
      await errorCode(() => port.setReviewSettings({ mode: "none", thresholdPercent: 95 })),
    ).toBe("mode-unavailable");
    expect((await port.snapshot()).reviewSettings.mode).toBe("all");
  });
});

describe("график и бригады", () => {
  test("бригада в отпуске: отметка на неделю в журнале", async () => {
    const s = await port.snapshot();
    const list = await port.setBrigadeWeek({
      brigadeId: s.brigades[0]!.id,
      weekFrom: s.week.from,
      status: "vacation",
    });
    expect(list).toHaveLength(1);
    expect((await port.snapshot()).audit[0]?.action).toBe("brigade.week");
  });

  test("применение графика отменяется: возвращается прежний", async () => {
    const previous = await port.applySchedule({
      rows: [
        { key: "a|b|d", objectLabel: "a", code: null, brigade: "b", day: "2026-10-27", row: 2 },
      ],
      fileName: "график.xlsx",
    });
    expect(previous).toBeNull();
    expect((await port.snapshot()).schedule?.rows).toHaveLength(1);
    await port.restoreSchedule(previous);
    expect((await port.snapshot()).schedule).toBeNull();
  });
});
