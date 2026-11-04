import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import {
  DRAFT_MARK,
  changedRanges,
  columnName,
  draftRowNumbers,
  factReportSheet,
  nextPushAt,
  sheetStatusText,
} from "@/domain/gas-ops/cloud-sheet";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { tabelRows, type TabelInput } from "@/domain/gas-ops/tabel";

/** Лист недели «ФАКТИЧЕСКИЙ ОТЧЁТ» для облачной таблицы (финальный промт, 1.4; ADR-063) */

const seed = buildSeed();
const input = (entries: TimeEntry[]): TabelInput => ({
  groups: seed.groups,
  brigades: seed.brigades,
  employees: seed.employees,
  objects: seed.objects,
  days: seed.week.days,
  entries,
  estimates: seed.estimates,
  expected: [],
});
const sheetOf = (entries: TimeEntry[]) =>
  factReportSheet({
    weekFrom: seed.week.from,
    weekTo: seed.week.to,
    days: seed.week.days,
    rows: tabelRows(input(entries)),
  });

describe("лист «ФАКТИЧЕСКИЙ ОТЧЁТ»", () => {
  const sheet = sheetOf(seed.entries);

  test("шапка: дни × три показателя, итог недели, отметка", () => {
    expect(sheet.header[0]![0]).toBe("ФАКТИЧЕСКИЙ ОТЧЁТ");
    expect(sheet.width).toBe(1 + seed.week.days.length * 3 + 3 + 1);
    expect(sheet.header[1]!.slice(1, 4)).toEqual([
      "Сумма начислений",
      "Эффективное время (ч.)",
      "Доходность часа",
    ]);
    expect(sheet.header[0]).toContain("Итого за неделю");
    for (const row of [...sheet.header, ...sheet.rows.map((r) => r.values)])
      expect(row).toHaveLength(sheet.width);
  });

  test("строки идут как в табеле: подразделение → бригада → бригадир → объект", () => {
    const rows = tabelRows(input(seed.entries));
    expect(sheet.rows.map((r) => r.key)).toEqual(rows.map((r) => r.id));
    const total = rows.find((r) => r.id === "total")!;
    const line = sheet.rows.find((r) => r.key === "total")!;
    expect(line.values.at(-4)).toBe(total.total.amountRub);
  });

  test("строка с непроверенными записями помечена «черновик» и подсвечивается", () => {
    const drafts = sheet.rows.filter((r) => r.draft);
    expect(drafts.length).toBeGreaterThan(0);
    for (const row of drafts) expect(row.values.at(-1)).toBe(DRAFT_MARK);
    expect(draftRowNumbers(sheet)[0]).toBeGreaterThan(2);
    const confirmedOnly = sheetOf(
      seed.entries.map((e) => ({ ...e, status: "confirmed" as const })),
    );
    expect(confirmedOnly.rows.some((r) => r.draft)).toBe(false);
  });

  test("часы с двумя знаками из минут: 190 мин — 3,17 ч", () => {
    const one = seed.entries.find(
      (e) => e.source !== "fact-report" && e.amountRub !== null && seed.week.days.includes(e.day),
    )!;
    const sheetOne = sheetOf([{ ...one, minutes: 190 }]);
    const address = sheetOne.rows.find((r) => r.values.some((v) => v === 3.17));
    expect(address).toBeTruthy();
  });
});

describe("пакеты: только изменившиеся диапазоны", () => {
  const sheet = sheetOf(seed.entries);

  test("первая отправка — весь лист, повтор того же листа — ничего", () => {
    const first = changedRanges(null, sheet);
    expect(first).toHaveLength(1);
    expect(first[0]!.range).toBe(`A1:${columnName(sheet.width)}${sheet.rows.length + 2}`);
    expect(changedRanges(sheet, sheet)).toEqual([]);
  });

  test("правка одной записи меняет только её строки", () => {
    const days = new Set(seed.week.days);
    const target = seed.entries.find((e) => days.has(e.day) && e.status === "confirmed")!;
    const next = sheetOf(
      seed.entries.map((e) => (e.id === target.id ? { ...e, minutes: e.minutes + 30 } : e)),
    );
    const updates = changedRanges(sheet, next);
    expect(updates.length).toBeGreaterThan(0);
    const rows = updates.reduce((a, u) => a + u.values.length, 0);
    expect(rows).toBeLessThan(sheet.rows.length);
    for (const u of updates) expect(u.range).toMatch(/^A\d+:[A-Z]+\d+$/);
  });

  test("другой состав строк — снова весь лист", () => {
    const fewer = sheetOf(seed.entries.slice(0, 5));
    expect(changedRanges(sheet, fewer)[0]!.range.startsWith("A1:")).toBe(true);
  });

  test("буквы столбцов", () => {
    expect([1, 26, 27, 52, 53].map(columnName)).toEqual(["A", "Z", "AA", "AZ", "BA"]);
  });

  test("не чаще раза в минуту", () => {
    expect(nextPushAt(null, "2026-10-03T12:00:00.000Z")).toBe("2026-10-03T12:00:00.000Z");
    expect(nextPushAt("2026-10-03T12:00:00.000Z", "2026-10-03T12:00:20.000Z")).toBe(
      "2026-10-03T12:01:00.000Z",
    );
    expect(nextPushAt("2026-10-03T12:00:00.000Z", "2026-10-03T12:05:00.000Z")).toBe(
      "2026-10-03T12:05:00.000Z",
    );
  });

  test("подпись статуса без обещаний", () => {
    expect(sheetStatusText({ connected: false, updatedAt: null })).toBe(
      "Облачная таблица: не подключена",
    );
    expect(sheetStatusText({ connected: true, updatedAt: "2026-10-03T12:40:00" })).toBe(
      "Таблица обновлена 12:40",
    );
  });
});
