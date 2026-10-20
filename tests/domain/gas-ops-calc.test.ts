import { describe, expect, test } from "bun:test";
import {
  effectiveMinutes,
  findDuplicates,
  findOverlaps,
  flagsOf,
  hoursOfMinutes,
  minutesOfHours,
  parseClock,
  revenuePerHour,
  totalsOf,
} from "@/domain/gas-ops/calc";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { factReport } from "@/data/mock/fact-report";

/**
 * Контрольный тест расчётов газового направления. Ожидания взяты из фактического отчёта
 * заказчика и из ТЗ, а не из кода: если расчёт разойдётся с файлом, тест обязан упасть.
 */

const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: "x",
  number: "ГЗ-00001",
  day: "2026-10-03",
  brigadeId: "brg-1",
  employeeId: "emp-1-1",
  objectId: "obj-1",
  startMinutes: null,
  endMinutes: null,
  breakMinutes: 0,
  minutes: 60,
  amountRub: null,
  status: "pending",
  createdBy: "emp-1-1",
  createdAt: "2026-10-03T18:00:00",
  reviewedBy: null,
  reviewedAt: null,
  comment: null,
  source: "mock",
  ...over,
});

describe("минуты смены", () => {
  test("08:30-11:40 — это 190 минут, а не 185", () => {
    const result = effectiveMinutes({ start: "08:30", end: "11:40" });
    expect(result.ok).toBe(true);
    expect(result.ok && result.minutes).toBe(190);
  });

  test("разделитель точка, как в отчёте заказчика", () => {
    expect(parseClock("8.20")).toBe(500);
    expect(parseClock("16.40")).toBe(1000);
    const result = effectiveMinutes({ start: "8.20", end: "16.40" });
    expect(result.ok && result.minutes).toBe(500);
  });

  test("перерыв вычитается", () => {
    const result = effectiveMinutes({ start: "8:00", end: "17:00", breakMinutes: 60 });
    expect(result.ok && result.minutes).toBe(480);
  });

  test("смена через полночь не ведётся", () => {
    const result = effectiveMinutes({ start: "22:00", end: "06:00" });
    expect(result).toEqual({ ok: false, error: "overnight" });
  });

  test("перерыв больше смены — ошибка, а не отрицательное время", () => {
    const result = effectiveMinutes({ start: "8:00", end: "9:00", breakMinutes: 90 });
    expect(result).toEqual({ ok: false, error: "break-too-long" });
  });

  test("нераспознанное время не превращается в ноль", () => {
    expect(effectiveMinutes({ start: "утром", end: "16:40" })).toEqual({
      ok: false,
      error: "start-format",
    });
    expect(effectiveMinutes({ start: "8:00", end: "25:70" })).toEqual({
      ok: false,
      error: "end-format",
    });
  });
});

describe("часы и минуты", () => {
  test("6,58 ч из файла — это 395 минут", () => {
    expect(minutesOfHours(6.58)).toBe(395);
    expect(hoursOfMinutes(395)).toBeCloseTo(6.5833, 4);
  });
});

describe("доходность часа", () => {
  /**
   * Три реальных строки фактического отчёта: сумма, часы и доходность стоят в файле,
   * формул в нём нет. Проверяем, что доходность считается от минут.
   */
  const samples = [
    { row: 7, amount: 44_847, hours: 6.58, expected: 6812 },
    { row: 10, amount: 61_322, hours: 6.5, expected: 9434 },
    { row: 23, amount: 45_712, hours: 4.33, expected: 10_549 },
  ];

  for (const s of samples) {
    test(`строка ${s.row}: ${s.amount} ₽ за ${s.hours} ч = ${s.expected} ₽/ч`, () => {
      expect(revenuePerHour(s.amount, minutesOfHours(s.hours))).toBe(s.expected);
    });
  }

  test("от округлённых часов получается другое число — поэтому считаем от минут", () => {
    expect(Math.round(44_847 / 6.58)).toBe(6816);
    expect(revenuePerHour(44_847, 395)).toBe(6812);
  });

  test("деление на ноль запрещено", () => {
    expect(revenuePerHour(42_095, 0)).toBeNull();
    expect(revenuePerHour(42_095, null)).toBeNull();
  });

  test("без суммы доходность не считается", () => {
    expect(revenuePerHour(null, 480)).toBeNull();
  });

  test("на строках файла с суммой, часами и доходностью расчёт от минут совпадает", () => {
    const rows = factReport.entries.filter(
      (e) => e.amount !== null && e.hours !== null && e.revenueInFile !== null,
    );
    const mismatched = rows.filter(
      (e) => revenuePerHour(e.amount, minutesOfHours(e.hours!)) !== e.revenueInFile,
    );
    expect(rows.length).toBe(84);
    /**
     * Две строки расходятся на рубль и обе — ровно половина рубля: 14 700 ₽ за 2,67 ч
     * это 160 минут, 14 700 / (160/60) = 5512,5. В файле стоит 5512, арифметическое
     * округление даёт 5513. Формула под файл не подгоняется: правило округления половины
     * согласует заказчик, см. OPEN-QUESTION 7 и docs/claude/01-DATA-AUDIT.md.
     */
    expect(mismatched.map((e) => e.excelRow).sort((a, b) => a - b)).toEqual([27, 56]);
    expect(mismatched.every((e) => (e.amount! / (minutesOfHours(e.hours!) / 60)) % 1 === 0.5)).toBe(
      true,
    );
  });
});

describe("пересечения и дубли", () => {
  test("пересечение внутри бригады за день находится", () => {
    const a = entry({ id: "a", startMinutes: 540, endMinutes: 780, minutes: 240 });
    const b = entry({
      id: "b",
      objectId: "obj-2",
      startMinutes: 720,
      endMinutes: 900,
      minutes: 180,
    });
    const overlaps = findOverlaps([a, b]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.minutes).toBe(60);
  });

  test("смежные смены без пересечения не считаются пересечением", () => {
    const a = entry({ id: "a", startMinutes: 540, endMinutes: 720, minutes: 180 });
    const b = entry({
      id: "b",
      objectId: "obj-2",
      startMinutes: 720,
      endMinutes: 900,
      minutes: 180,
    });
    expect(findOverlaps([a, b])).toHaveLength(0);
  });

  test("разные бригады в одно время — не пересечение", () => {
    const a = entry({ id: "a", startMinutes: 540, endMinutes: 780, minutes: 240 });
    const b = entry({
      id: "b",
      brigadeId: "brg-2",
      startMinutes: 540,
      endMinutes: 780,
      minutes: 240,
    });
    expect(findOverlaps([a, b])).toHaveLength(0);
  });

  test("записи без рамки смены в проверку пересечений не попадают", () => {
    const a = entry({ id: "a" });
    const b = entry({ id: "b" });
    expect(findOverlaps([a, b])).toHaveLength(0);
  });

  test("дубль — та же бригада, объект и день", () => {
    const a = entry({ id: "a" });
    const b = entry({ id: "b" });
    expect(findDuplicates([a, b])).toHaveLength(1);
  });

  test("отклонённая запись не делает дубль", () => {
    const a = entry({ id: "a", status: "rejected" });
    const b = entry({ id: "b" });
    expect(findDuplicates([a, b])).toHaveLength(0);
  });
});

describe("признаки записи", () => {
  test("часы без суммы — признак «нет суммы», доходность не считается", () => {
    const e = entry({ minutes: 480, amountRub: null });
    const flags = flagsOf({ entry: e, all: [e], hasEstimate: false, objectDays: 1 });
    expect(flags).toContain("no-amount");
    expect(revenuePerHour(e.amountRub, e.minutes)).toBeNull();
  });

  test("42 095 ₽ за 0,33 ч — аномалия для проверки, а не ошибка расчёта", () => {
    const e = entry({ minutes: minutesOfHours(0.33), amountRub: 42_095 });
    expect(revenuePerHour(e.amountRub, e.minutes)).toBe(126_285);
    expect(flagsOf({ entry: e, all: [e], hasEstimate: true, objectDays: 1 })).toContain(
      "high-rate",
    );
  });

  test("объект на несколько дней помечается, сумма не распределяется", () => {
    const e = entry({ minutes: 480, amountRub: 13_000 });
    expect(flagsOf({ entry: e, all: [e], hasEstimate: true, objectDays: 5 })).toContain(
      "multi-day-object",
    );
  });
});

describe("итоги набора", () => {
  test("доходность итога считается от суммы минут, а не как среднее по строкам", () => {
    const a = entry({ id: "a", minutes: 60, amountRub: 10_000 });
    const b = entry({ id: "b", minutes: 180, amountRub: 10_000 });
    const totals = totalsOf([a, b]);
    expect(totals.minutes).toBe(240);
    expect(totals.amountRub).toBe(20_000);
    expect(totals.revenuePerHour).toBe(5000);
    // среднее по строкам дало бы (10000 + 3333) / 2 = 6667 — так считать нельзя
    expect(totals.revenuePerHour).not.toBe(6667);
  });

  test("записи без суммы видны отдельным числом", () => {
    const totals = totalsOf([entry({ id: "a", minutes: 60, amountRub: null })]);
    expect(totals.withoutAmount).toBe(1);
    expect(totals.amountRub).toBe(0);
  });
});
