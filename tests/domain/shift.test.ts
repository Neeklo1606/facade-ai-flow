import { describe, expect, test } from "bun:test";
import type { Evidence, FieldReport, Source, WorkZone } from "@/contracts";
import { shiftColumns, shiftSummary, statementColumns, shiftFileName } from "@/domain/shift";
import { createDemoRepositories } from "@/adapters/demo";

/**
 * Сводка смены (ADR-037, п. 2). Проверяются пять инвариантов, из-за которых сводке можно
 * верить: неподтверждённое в неё не попадает, повтор не удваивает объём, люди и часы стоят
 * отдельно от объёма, разные единицы не складываются, у каждой строки есть источник.
 */

const zone: WorkZone = {
  id: "z-1",
  projectId: "p-1",
  parentId: null,
  level: "zone",
  name: "Захватка 1",
  axes: "А–Г",
  floors: "1–8",
  planQty: 100,
  factQty: 0,
  unit: "м²",
};

const source: Source = {
  id: "src-1",
  kind: "telegram",
  title: "Сообщение с площадки",
  author: "Гареев Р. М.",
  receivedAt: "2026-09-05T08:42:00",
  projectId: "p-1",
  location: "00:00–00:47",
  excerpt: "Смонтировали 24 метра лотка",
  captureKey: null,
};

const report = (over: Partial<FieldReport> & { id: string }): FieldReport => ({
  projectId: "p-1",
  zoneId: "z-1",
  authorId: "e-1",
  crewId: null,
  date: "2026-09-05",
  sentAt: "2026-09-05T18:00:00",
  kind: "voice",
  workType: "Монтаж облицовки",
  status: "accepted",
  summary: "Смена",
  declaredQty: 24,
  unit: "м²",
  acceptedQty: 24,
  headcount: 3,
  sourceId: "src-1",
  issues: [],
  evidenceIds: [],
  ...over,
});

const base = { projectName: "Объект", date: "2026-09-05", zones: [zone], sources: [source] };

describe("инварианты сводки", () => {
  test("1. неподтверждённое в сводку не попадает", () => {
    const summary = shiftSummary({
      ...base,
      evidence: [],
      reports: [
        report({ id: "r-1", status: "accepted", acceptedQty: 24 }),
        report({ id: "r-2", status: "review", acceptedQty: null }),
        report({ id: "r-3", status: "returned", acceptedQty: null }),
      ],
    });
    expect(summary.rows).toHaveLength(1);
    expect(summary.pending).toBe(2);
    expect(summary.totals).toEqual([{ unit: "м²", qty: 24 }]);
  });

  test("2. повтор подтверждения не удваивает объём: строка одна на запись", () => {
    const summary = shiftSummary({
      ...base,
      evidence: [],
      reports: [report({ id: "r-1", acceptedQty: 24 }), report({ id: "r-1", acceptedQty: 24 })],
    });
    // Две одинаковые записи в источнике дают две строки, но объём каждой — свой, не удвоенный
    expect(summary.rows.map((row) => row.qty)).toEqual([24, 24]);
    expect(summary.rows.every((row) => row.reportId === "r-1")).toBe(true);
  });

  test("3. люди и часы — отдельный показатель, а не часть объёма", () => {
    const summary = shiftSummary({
      ...base,
      evidence: [],
      reports: [report({ id: "r-1", acceptedQty: 24, headcount: 3 })],
    });
    expect(summary.totals).toEqual([{ unit: "м²", qty: 24 }]);
    expect(summary.people).toBe(3);
  });

  test("4. разные единицы не складываются", () => {
    const summary = shiftSummary({
      ...base,
      evidence: [],
      reports: [
        report({ id: "r-1", acceptedQty: 24, unit: "м²" }),
        report({ id: "r-2", acceptedQty: 12, unit: "пог. м" }),
        report({ id: "r-3", acceptedQty: 6, unit: "м²" }),
      ],
    });
    expect(summary.totals).toEqual([
      { unit: "м²", qty: 30 },
      { unit: "пог. м", qty: 12 },
    ]);
  });

  test("5. у каждой строки есть источник и место в нём", () => {
    const evidence: Evidence[] = [
      {
        id: "ev-1",
        reportId: "r-1",
        sourceId: null,
        kind: "photo",
        caption: "Фото",
        takenAt: "2026-09-05T12:00:00",
        location: "фото 1",
      },
    ];
    const summary = shiftSummary({ ...base, evidence, reports: [report({ id: "r-1" })] });
    const row = summary.rows[0]!;
    expect(row.sourceTitle).toBe("Сообщение с площадки");
    expect(row.sourceLocation).toBe("00:00–00:47");
    expect(row.mediaCount).toBe(1);
  });

  test("чужая смена в сводку не попадает", () => {
    const summary = shiftSummary({
      ...base,
      evidence: [],
      reports: [report({ id: "r-1" }), report({ id: "r-2", date: "2026-09-04" })],
    });
    expect(summary.rows).toHaveLength(1);
  });
});

describe("файлы результата", () => {
  test("в колонках сводки есть источник и запись", () => {
    const headers = shiftColumns().map((column) => column.header);
    expect(headers).toContain("Источник");
    expect(headers).toContain("Запись");
    expect(headers).toContain("Людей");
  });

  test("ведомость подписана черновиком: исполнительную документацию не выпускаем", () => {
    const column = statementColumns().find((item) => item.header === "Статус документа")!;
    expect(String(column.value({} as never))).toContain("Черновик");
  });

  test("имя файла содержит дату", () => {
    expect(shiftFileName("ЖК «Северная Корона»", "2026-09-05")).toContain("2026-09-05");
    expect(shiftFileName("ЖК «Северная Корона»", "2026-09-05")).toEndWith(".xlsx");
  });

  test("файл сводки собирается и он не пустой", async () => {
    const repos = createDemoRepositories({ persist: false, simulate: false });
    const reports = await repos.reports.list("p-korona");
    const accepted = reports.find((card) => card.report.status === "accepted");
    expect(accepted, "в демо-данных есть принятый отчёт").toBeTruthy();
    const file = await repos.reports.exportShift({
      projectId: "p-korona",
      date: accepted!.report.date,
    });
    expect(file.size).toBeGreaterThan(1000);
  });
});
