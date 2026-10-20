/**
 * Проверка выгрузки газового отчёта: файл собирается, открывается заново и сверяется
 * с теми же итогами, которые показывает экран.
 *
 * Запуск: `bun run scripts/check-gas-export.ts [куда-положить-файл]`
 * Падает с ненулевым кодом, если хоть одна сверка не сошлась.
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { buildCustomerWorkbook, customerFileName } from "@/adapters/gas-ops/xlsx";
import { gasExportResponse } from "@/api/gas-export";
import { fileNameFromDisposition } from "@/lib/gas-ops/export";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import {
  analyticRows,
  customerFormatRows,
  entriesOfRows,
  reportEntries,
  visibleReportRows,
} from "@/domain/gas-ops/report";
import { revenuePerHour } from "@/domain/gas-ops/calc";

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

// --- ADR-044, F6: имя файла, точные часы, ROUND, печать, закрепление ---

const expectedName = "Выработка_бригад_28.09-03.10.2026.xlsx";
check(customerFileName(seed.week) === expectedName, `имя файла: ${customerFileName(seed.week)}`);

// Заголовок ответа сервера: filename* по RFC 5987 и ASCII-запасной filename
const response = await gasExportResponse(
  new Request("http://localhost/api/gas/export", {
    method: "POST",
    body: JSON.stringify({
      rows,
      analytic,
      days: seed.week.days,
      week: seed.week,
      mode: "confirmed",
    }),
  }),
);
const disposition = response.headers.get("content-disposition") ?? "";
check(
  disposition.includes(`filename*=UTF-8''${encodeURIComponent(expectedName)}`),
  "Content-Disposition: filename* в UTF-8",
);
check(
  /filename="Vyrabotka_brigad_28\.09-03\.10\.2026\.xlsx"/.test(disposition),
  "Content-Disposition: запасной filename латиницей",
);
check(
  [...disposition].every((c) => c.charCodeAt(0) < 128),
  "заголовок целиком в ASCII",
);
check(
  fileNameFromDisposition(disposition) === expectedName,
  `вкладка читает имя из заголовка: ${fileNameFromDisposition(disposition)}`,
);

// Часы точным значением минуты / 60 с форматом 0.00
const firstAddress = rows.findIndex((r) => r.kind === "address" && r.total.minutes);
if (firstAddress >= 0) {
  const minutes = rows[firstAddress]!.total.minutes!;
  const cell = sheet.getRow(3 + firstAddress).getCell(totalCol + 1);
  check(
    numberOf(3 + firstAddress, totalCol + 1) === minutes / 60,
    `часы адресной строки точные: ${numberOf(3 + firstAddress, totalCol + 1)} = ${minutes} / 60`,
  );
  check(cell.numFmt === "0.00", `формат часов ${cell.numFmt}`);
}

// Доходность итоговых строк формулой ROUND(E/F,0) и с тем же результатом, что в системе
let roundRows = 0;
let roundSame = 0;
for (const [index, row] of rows.entries()) {
  if (row.kind === "address" || row.kind === "frame") continue;
  const formula = formulaOf(3 + index, totalCol + 2) ?? "";
  if (!formula.includes("ROUND(")) continue;
  roundRows += 1;
  // Пересчёт формулы так же, как Excel: сумма делится на точные часы ячейки
  const e = numberOf(3 + index, totalCol) ?? 0;
  const f = numberOf(3 + index, totalCol + 1) ?? 0;
  const excel = e === 0 || f === 0 ? null : Math.round(e / f);
  if (excel === row.total.revenue) roundSame += 1;
}
const aggregates = rows.filter((r) => r.kind !== "address" && r.kind !== "frame").length;
check(
  roundRows === aggregates,
  `доходность итоговых строк формулой ROUND: ${roundRows} из ${aggregates}`,
);
check(roundSame === roundRows, `ROUND(E/F,0) совпадает с системой: ${roundSame} из ${roundRows}`);

// Открытый вопрос 7: половина рубля на 14 700 ₽ / 160 мин описана как есть, не подогнана
const half = seed.entries.filter(
  (e) => e.amountRub === 14_700 && e.minutes === 160 && e.revenueInFile === 5_512,
);
check(half.length === 2, `строк 14 700 ₽ / 2,67 ч с половиной рубля: ${half.length}`);
check(
  half.every((e) => revenuePerHour(e.amountRub, e.minutes) === 5_513),
  "в системе и в файле выгрузки 5 513 ₽/ч, в файле заказчика 5 512: вопрос 7 открыт",
);
const notesText = (notes?.getColumn(1).values ?? []).map(String).join("\n");
check(notesText.includes("Открытый вопрос 7"), "лист «Как считалось» описывает вопрос 7");
check(notesText.includes("ROUND"), "лист «Как считалось» описывает ROUND(E/F,0)");

// Закрепление E3, печать альбомная по ширине на одну страницу, заголовки повторяются
const view = sheet.views[0] as {
  state?: string;
  xSplit?: number;
  ySplit?: number;
  topLeftCell?: string;
};
check(
  view?.state === "frozen" && view.xSplit === 4 && view.ySplit === 2,
  `закрепление E3: xSplit ${view?.xSplit}, ySplit ${view?.ySplit}`,
);
const page = sheet.pageSetup;
check(page.orientation === "landscape", `печать: ${page.orientation}`);
check(
  page.fitToPage === true && page.fitToWidth === 1 && page.fitToHeight === 0,
  "печать по ширине на одну страницу",
);
check(page.printTitlesRow === "1:2", `повтор строк заголовка: ${page.printTitlesRow}`);
check(
  (sheet.getColumn(1).width ?? 0) >= 16,
  `ширина подписи по содержимому: ${sheet.getColumn(1).width}`,
);

// Тот же набор строк, что на экране: «скрыть пустые» для субботы
const saturday = seed.week.days.length - 1;
const dayRows = visibleReportRows(rows, { period: saturday, hideEmpty: true });
const dayEntries = entriesOfRows(dayRows);
const dayBytes = await buildCustomerWorkbook({
  rows: dayRows,
  analytic: analytic.filter((a) => dayEntries.has(a.entryId)),
  days: seed.week.days,
  week: seed.week,
  mode: "confirmed",
});
const dayBook = new ExcelJS.Workbook();
await dayBook.xlsx.load(
  dayBytes.buffer.slice(
    dayBytes.byteOffset,
    dayBytes.byteOffset + dayBytes.byteLength,
  ) as ArrayBuffer,
);
const daySheet = dayBook.getWorksheet("Отчёт")!;
check(
  daySheet.rowCount === 2 + dayRows.length && dayRows.length < rows.length,
  `«скрыть пустые» за ${seed.week.days[saturday]}: строк в файле ${daySheet.rowCount - 2}, на экране ${dayRows.length} из ${rows.length}`,
);
check(
  String(daySheet.getRow(2 + dayRows.length).getCell(1).value) === "Итого",
  "в урезанном наборе последняя строка тоже «Итого»",
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
