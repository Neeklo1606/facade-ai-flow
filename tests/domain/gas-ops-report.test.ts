import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { factReport } from "@/data/mock/fact-report";
import { analyticRows, customerFormatRows, reportEntries } from "@/domain/gas-ops/report";
import { hoursOfMinutes } from "@/domain/gas-ops/calc";

/**
 * Контрольный тест агрегации: пересчёт из записей сверяется с итогами бригад и групп
 * в фактическом отчёте заказчика. Числа из файла в расчёт не берутся — только для сверки.
 */

const seed = buildSeed();
const base = {
  groups: seed.groups,
  brigades: seed.brigades,
  employees: seed.employees,
  objects: seed.objects,
  frames: seed.frames,
  days: seed.week.days,
};

/** Отчёт только по фактическим записям: демо-сценарии в сверку с файлом не попадают */
const factOnly = () =>
  customerFormatRows({
    ...base,
    entries: seed.entries.filter((e) => e.source === "fact-report"),
    mode: "confirmed",
  });

/** Часы в файле — сумма округлённых до двух знаков дневных часов, поэтому допуск 0,1 ч */
const CLOSE_HOURS = 0.1;

describe("сверка с фактическим отчётом", () => {
  const rows = factOnly();

  test("суммы бригад совпадают с файлом до рубля", () => {
    for (const brigade of seed.brigades) {
      const node = factReport.tree
        .flatMap((g) => g.children)
        .find((b) => b.excelRow === brigade.excelRow);
      if (!node) continue;
      const row = rows.find((r) => r.id === `b-${brigade.id}`);
      expect(row, `бригада ${brigade.name} должна быть в отчёте`).toBeDefined();
      expect(row!.total.amountRub ?? 0, brigade.name).toBe(node.total.amount ?? 0);
    }
  });

  test("часы бригад совпадают с файлом в пределах округления", () => {
    for (const brigade of seed.brigades) {
      const node = factReport.tree
        .flatMap((g) => g.children)
        .find((b) => b.excelRow === brigade.excelRow);
      if (!node) continue;
      const row = rows.find((r) => r.id === `b-${brigade.id}`);
      const hours = hoursOfMinutes(row!.total.minutes ?? 0);
      expect(Math.abs(hours - (node.total.hours ?? 0)), brigade.name).toBeLessThanOrEqual(
        CLOSE_HOURS,
      );
    }
  });

  test("суммы групп совпадают с файлом", () => {
    for (const group of seed.groups) {
      const node = factReport.tree.find((g) => g.excelRow === group.excelRow)!;
      const row = rows.find((r) => r.id === `g-${group.id}`)!;
      expect(row.total.amountRub ?? 0, group.name).toBe(node.total.amount ?? 0);
      expect(
        Math.abs(hoursOfMinutes(row.total.minutes ?? 0) - (node.total.hours ?? 0)),
        group.name,
      ).toBeLessThanOrEqual(CLOSE_HOURS);
    }
  });

  test("итог недели равен сумме видимых групп, а не строке «Итого» файла", () => {
    const total = rows.find((r) => r.id === "total")!;
    const groups = rows.filter((r) => r.kind === "group");
    expect(total.total.amountRub).toBe(groups.reduce((a, g) => a + (g.total.amountRub ?? 0), 0));
    expect(total.total.amountRub).toBe(1_524_132);
    // В строке «Итого» файла стоит 5 165 357 ₽: разница — группы, которых нет в выгрузке.
    expect(factReport.grandTotal.total.amount).toBe(5_165_357);
    expect(total.total.amountRub).not.toBe(factReport.grandTotal.total.amount);
  });

  test("сумма по дням равна сумме адресных строк того же дня", () => {
    const total = rows.find((r) => r.id === "total")!;
    for (const [i, day] of seed.week.days.entries()) {
      const fromEntries = seed.entries
        .filter((e) => e.source === "fact-report" && e.day === day)
        .reduce((a, e) => a + (e.amountRub ?? 0), 0);
      expect(total.days[i]!.amountRub ?? 0, day).toBe(fromEntries);
    }
  });
});

describe("двойной счёт", () => {
  const rows = factOnly();

  test("бригада 7: часы складываются по двум сотрудникам, сумма не удваивается", () => {
    const brigade = rows.find((r) => r.id === "b-brg-7")!;
    const employees = rows.filter((r) => r.parentId === brigade.id && r.kind === "employee");
    expect(employees).toHaveLength(2);
    const lead = employees.find((r) => r.id === "e-emp-7-1")!;
    const second = employees.find((r) => r.id === "e-emp-7-2")!;
    // Сумма числится за одним сотрудником, у второго только часы
    expect(second.total.amountRub).toBeNull();
    expect(brigade.total.amountRub).toBe(lead.total.amountRub);
    expect(brigade.total.minutes).toBe((lead.total.minutes ?? 0) + (second.total.minutes ?? 0));
    expect(hoursOfMinutes(brigade.total.minutes ?? 0)).toBeCloseTo(81.83, 1);
  });

  test("сумма группы — это сумма бригад, собственная строка не прибавляется", () => {
    for (const group of rows.filter((r) => r.kind === "group")) {
      const children = rows.filter((r) => r.parentId === group.id && r.kind === "brigade");
      expect(group.total.amountRub ?? 0, group.label).toBe(
        children.reduce((a, c) => a + (c.total.amountRub ?? 0), 0),
      );
      expect(group.total.minutes ?? 0, group.label).toBe(
        children.reduce((a, c) => a + (c.total.minutes ?? 0), 0),
      );
    }
  });

  test("сумма бригады — это сумма её сотрудников и адресов без сотрудника", () => {
    for (const brigade of rows.filter((r) => r.kind === "brigade")) {
      const children = rows.filter(
        (r) => r.parentId === brigade.id && (r.kind === "employee" || r.kind === "address"),
      );
      expect(brigade.total.amountRub ?? 0, brigade.label).toBe(
        children.reduce((a, c) => a + (c.total.amountRub ?? 0), 0),
      );
    }
  });

  test("строка рамки смены не несёт денег и часов работы", () => {
    for (const frame of rows.filter((r) => r.kind === "frame")) {
      expect(frame.total.amountRub).toBeNull();
      expect(frame.entryIds).toHaveLength(0);
      // в рамке стоят минуты смены целиком — они больше суммы по адресам этого сотрудника
      const employee = rows.find((r) => r.id === frame.parentId)!;
      expect(frame.total.minutes ?? 0).toBeGreaterThan(employee.total.minutes ?? 0);
    }
  });
});

describe("режимы отчёта", () => {
  test("в утверждённый отчёт идут только подтверждённые записи", () => {
    const confirmed = reportEntries(seed.entries, "confirmed");
    expect(confirmed.every((e) => e.status === "confirmed")).toBe(true);
    expect(confirmed).toHaveLength(seed.entries.filter((e) => e.status === "confirmed").length);
  });

  test("предварительный отчёт добавляет записи на проверке и больше по сумме", () => {
    const strict = customerFormatRows({ ...base, entries: seed.entries, mode: "confirmed" });
    const draft = customerFormatRows({ ...base, entries: seed.entries, mode: "preliminary" });
    const amountOf = (rows: ReturnType<typeof customerFormatRows>) =>
      rows.find((r) => r.id === "total")!.total.amountRub ?? 0;
    expect(amountOf(draft)).toBeGreaterThan(amountOf(strict));
    const pending = seed.entries.filter((e) => e.status === "pending");
    expect(amountOf(draft) - amountOf(strict)).toBe(
      pending.reduce((a, e) => a + (e.amountRub ?? 0), 0),
    );
  });

  test("черновик и отклонённое не попадают ни в один режим", () => {
    const ids = new Set(reportEntries(seed.entries, "preliminary").map((e) => e.id));
    for (const e of seed.entries.filter((x) => x.status === "draft" || x.status === "rejected")) {
      expect(ids.has(e.id), e.number).toBe(false);
    }
  });
});

describe("строки без суммы", () => {
  test("адресная строка с часами и без суммы остаётся с прочерком доходности", () => {
    const rows = factOnly();
    const noAmount = rows.filter((r) => r.kind === "address" && r.total.amountRub === null);
    expect(noAmount.length).toBeGreaterThan(0);
    for (const row of noAmount) {
      expect(row.total.revenue).toBeNull();
      expect(row.total.minutes ?? 0).toBeGreaterThan(0);
    }
  });

  test("девять фактических записей без суммы сохранились", () => {
    const withoutAmount = seed.entries.filter(
      (e) => e.source === "fact-report" && e.amountRub === null,
    );
    expect(withoutAmount).toHaveLength(9);
  });
});

describe("аналитическая таблица", () => {
  test("строк столько же, сколько записей в режиме", () => {
    const rows = analyticRows({
      groups: seed.groups,
      brigades: seed.brigades,
      employees: seed.employees,
      objects: seed.objects,
      days: seed.week.days,
      entries: seed.entries,
      mode: "preliminary",
    });
    expect(rows).toHaveLength(reportEntries(seed.entries, "preliminary").length);
    expect(rows.every((r) => r.brigadeName !== r.entryId)).toBe(true);
  });

  test("у каждой строки известен источник данных", () => {
    const rows = analyticRows({
      groups: seed.groups,
      brigades: seed.brigades,
      employees: seed.employees,
      objects: seed.objects,
      days: seed.week.days,
      entries: seed.entries,
      mode: "preliminary",
    });
    expect(rows.every((r) => r.source === "fact-report" || r.source === "mock")).toBe(true);
  });
});
