import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { factReportFull as factReport } from "@/data/mock/fact-report.full";
import { factReport as liteReport } from "@/data/mock/fact-report";
import {
  analyticRows,
  changedEntryIds,
  customerFormatRows,
  dayShortLabel,
  gasReportFileName,
  gasReportFileNameAscii,
  pathToEntry,
  reportEntries,
  rowHasValues,
  visibleReportRows,
} from "@/domain/gas-ops/report";
import { fmtHours, hoursOfMinutes } from "@/domain/gas-ops/calc";
import { reconcile, reconcileLines } from "@/domain/gas-ops/reconcile";
import { reconcileLinesOf } from "@/api/gas-report";
import { contentDisposition } from "@/api/gas-export";
import { fileNameFromDisposition } from "@/lib/gas-ops/export";
import { ReconcileLines } from "@/components/gas-ops/report/ReconcileBlock";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

// --- ADR-044, F6: вид отчёта, сверка, имя файла ---------------------------------

describe("вид отчёта на экране и в файле", () => {
  const all = customerFormatRows({ ...base, entries: seed.entries, mode: "confirmed" });
  const saturday = seed.week.days.length - 1;

  test("«скрыть пустые» выключено: строки те же, что в Excel", () => {
    expect(visibleReportRows(all, { period: "week", hideEmpty: false })).toBe(all);
  });

  test("«скрыть пустые» за день: каждая адресная строка со значением в этот день", () => {
    const rows = visibleReportRows(all, { period: saturday, hideEmpty: true });
    expect(rows.length).toBeLessThan(all.length);
    expect(rows[rows.length - 1]!.kind).toBe("total");
    for (const row of rows.filter((r) => r.kind === "address")) {
      expect(rowHasValues(row, saturday)).toBe(true);
    }
    // родитель каждой строки остаётся в наборе
    const ids = new Set(rows.map((r) => r.id));
    for (const row of rows) if (row.parentId) expect(ids.has(row.parentId)).toBe(true);
    // итоги не пересчитываются: сумма дня та же, что в полном наборе
    expect(rows.find((r) => r.kind === "total")!.days[saturday]).toEqual(
      all.find((r) => r.kind === "total")!.days[saturday]!,
    );
  });

  test("демо-объект ОБ-200: 12:00–14:30 даёт строку 14 700 ₽ / 2,50 ч / 5 880 ₽/ч за 03.10", () => {
    const entry = {
      ...seed.entries.find((e) => e.brigadeId === "brg-1" && e.source === "mock")!,
      id: "show-m200",
      objectId: "obj-m200",
      day: "2026-10-03",
      startMinutes: 12 * 60,
      endMinutes: 14 * 60 + 30,
      breakMinutes: 0,
      minutes: 150,
      amountRub: 14_700,
      status: "confirmed" as const,
    };
    const entries = [...seed.entries, entry];
    const rows = customerFormatRows({ ...base, entries, mode: "confirmed" });
    const path = pathToEntry(rows, "show-m200", entries, seed.week.days);
    expect(path).not.toBeNull();
    expect(path!.dayIndex).toBe(saturday);
    const row = rows.find((r) => r.id === path!.rowId)!;
    expect(row.days[saturday]).toEqual({ amountRub: 14_700, minutes: 150, revenue: 5_880 });
    expect(path!.ancestors[0]).toBe("g-grp-1");
    expect(path!.ancestors).toContain("b-brg-1");
    expect(changedEntryIds(entries, seed.entries)).toEqual(new Set(["show-m200"]));
  });

  test("изменённая запись отмечается, нетронутые нет", () => {
    const first = seed.entries.find((e) => e.status === "pending")!;
    const entries = seed.entries.map((e) =>
      e.id === first.id
        ? { ...e, status: "confirmed" as const, reviewedAt: "2026-10-03T15:00:00" }
        : e,
    );
    expect([...changedEntryIds(entries, seed.entries)]).toEqual([first.id]);
  });

  test("подписи дней: «Пн 28.09» … «Сб 03.10»", () => {
    expect(seed.week.days.map(dayShortLabel)).toEqual([
      "Пн 28.09",
      "Вт 29.09",
      "Ср 30.09",
      "Чт 01.10",
      "Пт 02.10",
      "Сб 03.10",
    ]);
  });

  test("имя файла и заголовок Content-Disposition", () => {
    expect(gasReportFileName(seed.week)).toBe("Выработка_бригад_28.09-03.10.2026.xlsx");
    expect(gasReportFileNameAscii(seed.week)).toBe("Vyrabotka_brigad_28.09-03.10.2026.xlsx");
    const header = contentDisposition(
      gasReportFileName(seed.week),
      gasReportFileNameAscii(seed.week),
    );
    expect(header).toStartWith(
      "attachment; filename=\"Vyrabotka_brigad_28.09-03.10.2026.xlsx\"; filename*=UTF-8''",
    );
    expect(fileNameFromDisposition(header)).toBe("Выработка_бригад_28.09-03.10.2026.xlsx");
    expect(fileNameFromDisposition('attachment; filename="a.xlsx"')).toBe("a.xlsx");
    expect(fileNameFromDisposition(null)).toBeNull();
  });
});

describe("сверка с файлом заказчика", () => {
  const facts = {
    week: factReport.meta.week,
    entries: factReport.entries,
    grandTotal: factReport.grandTotal.total,
    groupCodes: factReport.groups.map((g) => g.code),
  };
  const result = reconcile(facts, seed.entries);

  test("видимые строки файла совпадают с системой до рубля", () => {
    expect(result.file).toEqual({ amountRub: 1_524_132, hours: 361.35, records: 93 });
    expect(result.system.amountRub).toBe(1_524_132);
    expect(result.diffRub).toBe(0);
  });

  test("«Итого» файла: разница по группам 2 и 4, формулы не подгонялись", () => {
    expect(result.fileTotal).toEqual({ amountRub: 5_165_357, hours: 776.08 });
    expect(result.hidden).toEqual({ amountRub: 3_641_225, hours: 414.73, revenue: 8_780 });
    expect(result.missingGroups).toEqual(["2", "4"]);
  });

  test("доходность: 82 из 84 строк, две на половине рубля (вопрос 7)", () => {
    expect(result.revenue.checked).toBe(84);
    expect(result.revenue.matched).toBe(82);
    expect(result.revenue.other).toBe(0);
    expect(result.revenue.halfRuble).toEqual([
      { amountRub: 14_700, minutes: 160, inFile: 5_512, system: 5_513 },
      { amountRub: 14_700, minutes: 160, inFile: 5_512, system: 5_513 },
    ]);
  });

  test("расхождение с системой называется, а не прячется", () => {
    const changed = seed.entries.map((e, i) =>
      i === 0 && e.source === "fact-report" ? { ...e, amountRub: (e.amountRub ?? 0) + 100 } : e,
    );
    const lines = reconcileLines(reconcile(facts, changed));
    expect(lines[0]!.text).toContain("расходится на 100 ₽");
  });

  test("текст блока на экране — ровно строки расчёта сверки", () => {
    const lines = reconcileLinesOf(liteReport, seed.entries);
    expect(lines).toEqual(reconcileLines(result));
    const html = renderToStaticMarkup(
      createElement(ReconcileLines, {
        lines,
        link: (_line: unknown, children: ReactNode) => createElement("a", { href: "#" }, children),
      }),
    );
    const text = (html.match(/<li[^>]*>(.*?)<\/li>/g) ?? []).map((li) =>
      li
        .replace(/<[^>]+>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'"),
    );
    expect(text).toEqual(
      lines.map((line) => (line.question ? `${line.text} ${line.question.label}` : line.text)),
    );
    // и цифры в нём те, что в файле и в расчёте; неразрывные пробелы разрядов как обычные
    const plain = (value: string | undefined) => (value ?? "").replace(/[\u00a0\u202f]/g, " ");
    expect(plain(text[0])).toBe(
      "Видимые строки файла 28.09 - 03.10: 1 524 132 ₽, 361,35 ч. Система: то же значение до рубля." +
        ` Часы от минут: ${fmtHours(Math.round((result.system.minutes / 60) * 100) / 100)}, в файле сложены округлённые часы дней.`,
    );
    expect(plain(text[1])).toBe(
      "Строка «Итого» в файле: 5 165 357 ₽, 776,08 ч. Похоже, в выгрузку не попали группы 2 и 4. Вопрос 8 к согласованию",
    );
  });
});
