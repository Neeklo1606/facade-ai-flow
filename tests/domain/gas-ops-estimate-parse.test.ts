import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { sheetsOfXlsx } from "@/adapters/gas-ops/estimate-file";
import {
  cellNumber,
  detectFormat,
  parseEstimateGrid,
  parseEstimateWorkbook,
  sectionsSum,
  type Cell,
} from "@/domain/gas-ops/estimate-parse";
import { applyRule, DEFAULT_RULE_TERMS } from "@/domain/gas-ops/work-cost";

/**
 * Разбор смет (ADR-053, раздел 1). Ожидания — настоящие итоги двух смет заказчика из задачи
 * владельца от 25.10.2026, адресов нет. Файлы собираются в тесте через exceljs и читаются
 * тем же адаптером, что и в браузере: проверяется весь путь «xlsx → сетка → итоги».
 */

type Row = [number, Cell[]];

async function xlsxOf(sheets: { name: string; rows: Row[] }[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const [rowNumber, cells] of sheet.rows) {
      const row = ws.getRow(rowNumber);
      cells.forEach((value, i) => {
        if (value !== null && value !== undefined) row.getCell(i + 1).value = value;
      });
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Ячейка в колонке col (с 0) — остальные пустые */
function at(cols: Record<number, Cell>): Cell[] {
  const max = Math.max(...Object.keys(cols).map(Number));
  return Array.from({ length: max + 1 }, (_, i) => cols[i] ?? null);
}

/** Формат А: ГРАНД-Смета. Колонка сумм 15, трудозатраты 10, подписи в колонке 2 */
const grandRows: Row[] = [
  [10, at({ 0: "Наименование программного продукта", 6: "ГРАНД-Смета, версия 2026.2" })],
  [24, at({ 0: "ЛОКАЛЬНЫЙ СМЕТНЫЙ РАСЧЕТ (СМЕТА) № " })],
  [43, at({ 10: "всего с учетом коэффициентов", 15: "всего в текущем уровне цен" })],
  [45, at({ 0: "Раздел 1. Монтаж стальных газопроводов" })],
  [50, at({ 2: "Итого прямые затраты", 15: 1319.42 })],
  [450, at({ 2: "Всего по разделу 1 Монтаж стальных газопроводов", 15: 90000.08 })],
  [454, at({ 0: "Раздел 2. Испытания газопроводов" })],
  [473, at({ 2: " Материалы", 15: 212.08 })],
  [483, at({ 2: "Всего по разделу 2 Испытания газопроводов", 15: 30000.16 })],
  [487, at({ 2: "Итоги по смете:" })],
  [488, at({ 2: " Всего прямые затраты (справочно)", 15: 60000.5 })],
  [493, at({ 2: " Материалы", 15: 20000.01 })],
  [500, at({ 2: " материалы", 15: 14129.33 })],
  [519, at({ 2: "Всего", 15: 120000.24 })],
  [520, at({ 2: " Всего ФОТ (справочно)", 15: 35000.91 })],
  [521, at({ 2: " Всего накладные расходы (справочно)", 15: 38000.28 })],
  [522, at({ 2: " Всего сметная прибыль (справочно)", 15: 22000.46 })],
  [523, at({ 2: " НДС 22%", 15: 26400.05 })],
  [524, at({ 2: "ВСЕГО по смете", 15: 146400.29 })],
  [526, at({ 2: " Затраты труда рабочих", 10: "50,2512008" })],
  [530, at({ 1: "Составил:" })],
];

/** Формат Б: ресурсная 14 граф. Суммы в колонке 7 «общая», трудозатраты в 12, числа строками */
const resourceRows: Row[] = [
  [21, at({ 0: "№ пп", 2: "Наименование", 6: "Сметная стоимость", 12: "Т/з осн. раб." })],
  [22, at({ 4: "на ед.", 7: "общая" })],
  [23, at({ 8: "Осн.З/п", 9: "Эк.Маш.", 10: "З/пМех", 11: "Мат" })],
  [26, at({ 0: "Раздел 3. Монтаж стальных газопроводов" })],
  [52, at({ 0: " Итого", 7: "70000,00" })],
  [154, at({ 0: " Итого по разделу 3 Монтаж стальных газопроводов", 7: "75000,32" })],
  [167, at({ 0: " Итого по разделу 7 Субподрядные работы", 7: "4427,24", 12: "2,87" })],
  [176, at({ 0: " Итого по разделу 9 Корректировки для загрузки", 7: "573,35" })],
  [177, at({ 0: "ИТОГИ ПО СМЕТЕ:" })],
  [178, at({ 0: "Итого прямые затраты по смете в текущих ценах", 7: "55000,56" })],
  [179, at({ 0: "Накладные расходы", 7: "16500,40" })],
  [180, at({ 0: "Сметная прибыль", 7: "9500,95" })],
  [181, at({ 0: "Итоги по смете:" })],
  [182, at({ 0: " Итого", 7: "80000,91", 12: "40,125" })],
  [184, at({ 0: " Материалы", 7: "30000,25" })],
  [185, at({ 0: " Машины и механизмы", 7: "904,36" })],
  [186, at({ 0: " ФОТ", 7: "16000,95" })],
  [187, at({ 0: " Накладные расходы", 7: "16500,40" })],
  [188, at({ 0: " Сметная прибыль", 7: "9500,95" })],
  [189, at({ 0: " НДС 5%", 7: "4000,05" })],
  [190, at({ 0: " ВСЕГО по смете", 7: "84000,96", 12: "40,125" })],
  [194, at({ 0: "Составил: ___________________________" })],
];

describe("числа из ячеек", () => {
  test("число, строка с запятой, строка с точкой, пробелы разрядов", () => {
    expect(cellNumber(12345.67)).toBe(12345.67);
    expect(cellNumber("12345,67")).toBe(12345.67);
    expect(cellNumber("123456.78")).toBe(123456.78);
    expect(cellNumber("1 234,50")).toBe(1234.5);
    expect(cellNumber("руб.")).toBeNull();
    expect(cellNumber("'48")).toBeNull();
    expect(cellNumber(null)).toBeNull();
  });
});

describe("формат А, ГРАНД-Смета", () => {
  test("итоги, НДС, разделы и трудозатраты с номерами строк", async () => {
    const sheets = await sheetsOfXlsx(await xlsxOf([{ name: "Смета", rows: grandRows }]));
    const parsed = parseEstimateWorkbook(sheets);
    expect(parsed.format).toBe("grand");
    expect(parsed.status).toBe("parsed");
    expect(parsed.issues).toEqual([]);
    expect(parsed.totals.withoutVat).toEqual({ kopecks: 12_000_024, row: 519 });
    expect(parsed.totals.materials).toEqual({ kopecks: 2_000_001, row: 493 });
    expect(parsed.totals.vat).toEqual({ kopecks: 2_640_005, row: 523 });
    expect(parsed.totals.total).toEqual({ kopecks: 14_640_029, row: 524 });
    expect(parsed.totals.direct?.kopecks).toBe(6_000_050);
    expect(parsed.totals.payroll?.kopecks).toBe(3_500_091);
    expect(parsed.totals.overhead?.kopecks).toBe(3_800_028);
    expect(parsed.totals.profit?.kopecks).toBe(2_200_046);
    expect(parsed.vatRate).toBe(22);
    expect(parsed.sections.map((s) => [s.title, s.kopecks, s.row])).toEqual([
      ["Раздел 1 Монтаж стальных газопроводов", 9_000_008, 450],
      ["Раздел 2 Испытания газопроводов", 3_000_016, 483],
    ]);
    expect(sectionsSum(parsed)).toBe(parsed.totals.withoutVat!.kopecks);
    expect(parsed.laborHours).toEqual({ value: 50.2512008, row: 526 });
  });

  test("кандидат «без НДС минус материалы» 100 000,23", () => {
    const parsed = parseEstimateGrid(gridOf(grandRows));
    const result = applyRule(parsed.totals, DEFAULT_RULE_TERMS);
    expect(result).toEqual({ ok: true, kopecks: 10_000_023 });
  });
});

describe("формат Б, ресурсная смета 14 граф", () => {
  test("итоги, НДС 5 %, разделы и трудозатраты 40,125", async () => {
    // Рядом пустой лист-шаблон «12 граф», как в файлах заказчика: он не должен победить
    const sheets = await sheetsOfXlsx(
      await xlsxOf([
        { name: "Ресурсная смета 12 граф", rows: resourceRows.slice(0, 3) },
        { name: "Ресурсная смета 14 граф", rows: resourceRows },
      ]),
    );
    const parsed = parseEstimateWorkbook(sheets);
    expect(parsed.sheet).toBe("Ресурсная смета 14 граф");
    expect(parsed.format).toBe("resource");
    expect(parsed.status).toBe("parsed");
    expect(parsed.totals.withoutVat).toEqual({ kopecks: 8_000_091, row: 182 });
    expect(parsed.totals.materials).toEqual({ kopecks: 3_000_025, row: 184 });
    expect(parsed.totals.vat).toEqual({ kopecks: 400_005, row: 189 });
    expect(parsed.totals.total).toEqual({ kopecks: 8_400_096, row: 190 });
    expect(parsed.totals.direct?.kopecks).toBe(5_500_056);
    expect(parsed.totals.payroll?.kopecks).toBe(1_600_095);
    expect(parsed.vatRate).toBe(5);
    expect(parsed.laborHours).toEqual({ value: 40.125, row: 182 });
    expect(parsed.sections).toHaveLength(3);
    expect(sectionsSum(parsed)).toBe(8_000_091);
  });

  test("кандидат «без НДС минус материалы» 50 000,66", () => {
    const parsed = parseEstimateGrid(gridOf(resourceRows));
    expect(applyRule(parsed.totals, DEFAULT_RULE_TERMS)).toEqual({ ok: true, kopecks: 5_000_066 });
  });
});

describe("молчаливого числа нет", () => {
  test("нет строки итога: «Требует проверки сметчиком»", () => {
    const rows = resourceRows.filter(([n]) => n !== 182);
    const parsed = parseEstimateGrid(gridOf(rows));
    expect(parsed.status).toBe("needs-review");
    expect(parsed.totals.withoutVat).toBeUndefined();
    expect(parsed.issues.some((i) => i.message.includes("итога без НДС"))).toBe(true);
    expect(applyRule(parsed.totals, DEFAULT_RULE_TERMS)).toEqual({
      ok: false,
      missing: ["withoutVat"],
    });
  });

  test("разделы не сходятся с итогом больше чем на 1 ₽: замечание со строкой итога", () => {
    const rows: Row[] = resourceRows.map(([n, cells]) =>
      n === 176 ? [n, at({ 0: " Итого по разделу 9 Корректировки", 7: "575,00" })] : [n, cells],
    );
    const parsed = parseEstimateGrid(gridOf(rows));
    expect(parsed.status).toBe("needs-review");
    const issue = parsed.issues.find((i) => i.message.startsWith("Сумма разделов"));
    expect(issue?.row).toBe(182);
    expect(issue?.message).toContain("1,65 ₽");
  });

  test("копейки округления разделов в пределах 1 ₽ не считаются расхождением", () => {
    const rows: Row[] = resourceRows.map(([n, cells]) =>
      n === 176 ? [n, at({ 0: " Итого по разделу 9 Корректировки", 7: "573,98" })] : [n, cells],
    );
    expect(parseEstimateGrid(gridOf(rows)).status).toBe("parsed");
  });

  test("строки с суммой ниже «ВСЕГО по смете»: замечание с номером строки", () => {
    const rows: Row[] = [
      ...resourceRows.filter(([n]) => n < 194),
      [191, at({ 6: "Технадзор", 7: "6000.51" })],
      [193, at({ 6: "Итого", 7: "90001.47" })],
    ];
    const parsed = parseEstimateGrid(gridOf(rows));
    expect(parsed.status).toBe("needs-review");
    expect(parsed.issues.map((i) => i.row)).toEqual([191, 193]);
    // Итог берётся из строки «ВСЕГО по смете», а не из последнего «Итого»
    expect(parsed.totals.total?.kopecks).toBe(8_400_096);
  });

  test("без НДС плюс НДС не равно ВСЕГО", () => {
    const rows: Row[] = resourceRows.map(([n, cells]) =>
      n === 190 ? [n, at({ 0: " ВСЕГО по смете", 7: "84100,00" })] : [n, cells],
    );
    const parsed = parseEstimateGrid(gridOf(rows));
    expect(parsed.status).toBe("needs-review");
    expect(parsed.issues[0]?.row).toBe(190);
  });

  test("чужая таблица: формат не распознан, итогов нет", () => {
    const parsed = parseEstimateGrid([
      ["Бригада", "Часы"],
      ["Б-1", 8],
    ]);
    expect(detectFormat([["Бригада"]])).toBeNull();
    expect(parsed.status).toBe("unknown-format");
    expect(parsed.totals).toEqual({});
  });
});

function gridOf(rows: Row[]): Cell[][] {
  const grid: Cell[][] = [];
  for (const [n, cells] of rows) grid[n - 1] = cells;
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
}
