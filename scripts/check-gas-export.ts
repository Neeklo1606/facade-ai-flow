/**
 * Проверка выгрузки газового отчёта: файл собирается, открывается заново и сверяется
 * с теми же итогами, которые показывает экран.
 *
 * Запуск: `bun run scripts/check-gas-export.ts [куда-положить-файл]`
 * Падает с ненулевым кодом, если хоть одна сверка не сошлась.
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { buildCustomerWorkbook } from "@/adapters/gas-ops/xlsx";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { analyticRows, customerFormatRows, reportEntries } from "@/domain/gas-ops/report";

const out = process.argv[2] ?? ".verify/gas-report.xlsx";
const seed = buildSeed();
const base = {
  groups: seed.groups,
  brigades: seed.brigades,
  employees: seed.employees,
  objects: seed.objects,
  days: seed.week.days,
  entries: seed.entries,
  mode: "confirmed" as const,
};
const rows = customerFormatRows({ ...base, frames: seed.frames });
const analytic = analyticRows(base);

const bytes = await buildCustomerWorkbook({
  rows,
  analytic,
  days: seed.week.days,
  week: { from: seed.week.from, to: seed.week.to },
  mode: "confirmed",
});
writeFileSync(out, bytes);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
);

const problems: string[] = [];
const ok: string[] = [];
const check = (condition: boolean, text: string) => {
  (condition ? ok : problems).push(text);
};

const sheet = wb.getWorksheet("Отчёт");
const flat = wb.getWorksheet("Записи");
const notes = wb.getWorksheet("Как считалось");
check(!!sheet, "лист «Отчёт» есть");
check(!!flat, "лист «Записи» есть");
check(!!notes, "лист «Как считалось» есть");
if (!sheet || !flat) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const FIRST_DAY_COL = 5;
const totalCol = FIRST_DAY_COL + seed.week.days.length * 3;

const numberOf = (row: number, col: number): number | null => {
  const value = sheet.getRow(row).getCell(col).value;
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    return typeof result === "number" ? result : null;
  }
  return null;
};
const formulaOf = (row: number, col: number): string | null => {
  const value = sheet.getRow(row).getCell(col).value;
  return value && typeof value === "object" && "formula" in value
    ? String((value as { formula: string }).formula)
    : null;
};

// Строка «Итого» в листе: последняя строка отчёта
const totalRowNumber = 3 + rows.length - 1;
check(
  String(sheet.getRow(totalRowNumber).getCell(1).value ?? "") === "Итого",
  "последняя строка отчёта — «Итого»",
);

const total = rows.find((r) => r.id === "total")!;
check(
  numberOf(totalRowNumber, totalCol) === (total.total.amountRub ?? 0),
  `итог недели в файле ${numberOf(totalRowNumber, totalCol)} совпадает с расчётом ${total.total.amountRub}`,
);
check(
  (formulaOf(totalRowNumber, totalCol) ?? "").startsWith("SUM("),
  "итог недели записан формулой SUM по строкам групп",
);

// Итоги по дням
for (const [index, day] of seed.week.days.entries()) {
  const col = FIRST_DAY_COL + index * 3;
  const expected = total.days[index]?.amountRub ?? 0;
  const inFile = numberOf(totalRowNumber, col) ?? 0;
  check(inFile === expected, `${day}: в файле ${inFile}, в расчёте ${expected}`);
}

// Группы: формулы и значения
let groupRowNumber = 3;
for (const [index, row] of rows.entries()) {
  if (row.kind !== "group") continue;
  groupRowNumber = 3 + index;
  const inFile = numberOf(groupRowNumber, totalCol) ?? 0;
  check(
    inFile === (row.total.amountRub ?? 0),
    `группа «${row.label}»: в файле ${inFile}, в расчёте ${row.total.amountRub}`,
  );
  check(
    (formulaOf(groupRowNumber, totalCol) ?? "").startsWith("SUM("),
    `группа «${row.label}»: итог формулой SUM`,
  );
  check(
    sheet.getRow(groupRowNumber).outlineLevel === 0,
    `группа «${row.label}»: уровень группировки 0`,
  );
}

// Адресные строки: уровень группировки и значение без формулы
const address = rows.findIndex((r) => r.kind === "address");
if (address >= 0) {
  const rowNumber = 3 + address;
  check((sheet.getRow(rowNumber).outlineLevel ?? 0) > 0, "адресная строка свёрнута внутрь уровня");
  check(formulaOf(rowNumber, totalCol) === null, "адресная строка записана значением, без формулы");
}

// Объединённые заголовки дней
const merges = (sheet.model as { merges?: string[] }).merges ?? [];
check(merges.length > 0, `объединённых ячеек в листе: ${merges.length}`);

// Лист «Записи»
check(
  flat.rowCount - 1 === analytic.length,
  `строк в листе «Записи»: ${flat.rowCount - 1}, записей в отчёте: ${analytic.length}`,
);
const confirmed = reportEntries(seed.entries, "confirmed");
check(
  analytic.length === confirmed.length,
  `в отчёт вошли только подтверждённые записи: ${confirmed.length}`,
);

// Ни одной реальной фамилии и улицы в файле
const text = JSON.stringify(wb.model);
const forbidden = [
  "Кусей",
  "Малый",
  "Козык",
  "Сыпченко",
  "Баев",
  "Габдумаликов",
  "Залесский",
  "Вырвин",
  "Липка",
  "Супрун",
  "Должиков",
  "Дзержинск",
  "Благодатная",
];
const leaked = forbidden.filter((word) => text.includes(word));
check(leaked.length === 0, `персональных данных в файле нет${leaked.length ? `: ${leaked}` : ""}`);

console.log(`Файл: ${out}`);
for (const line of ok) console.log(`  ok   ${line}`);
for (const line of problems) console.log(`  FAIL ${line}`);
if (problems.length > 0) process.exit(1);
console.log(`Сверок пройдено: ${ok.length}`);
