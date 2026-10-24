/**
 * Синтетическая смета для e2e (ADR-053): Playwright в Node не грузит exceljs из подключённых
 * симлинком зависимостей (см. gas-report-state.cli.ts), поэтому файл собирает bun.
 * `bun run e2e/gas-estimate-file.cli.ts <файл.xlsx>` — ГРАНД-Смета с итогами формата А.
 */
import ExcelJS from "exceljs";

const [path] = process.argv.slice(2);
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Смета");
const put = (row: number, cols: Record<number, string | number>) => {
  for (const [c, v] of Object.entries(cols)) ws.getRow(row).getCell(Number(c) + 1).value = v;
};
put(10, { 6: "ГРАНД-Смета, версия 2026.2" });
put(43, { 10: "всего с учетом коэффициентов", 15: "всего в текущем уровне цен" });
put(450, { 2: "Всего по разделу 1 Монтаж стальных газопроводов", 15: 149852.08 });
put(483, { 2: "Всего по разделу 2 Испытания газопроводов", 15: 39306.16 });
put(487, { 2: "Итоги по смете:" });
put(493, { 2: " Материалы", 15: 23703.01 });
put(519, { 2: "Всего", 15: 189158.24 });
put(523, { 2: " НДС 22%", 15: 41614.81 });
put(524, { 2: "ВСЕГО по смете", 15: 230773.05 });
put(526, { 2: " Затраты труда рабочих", 10: "77,5712008" });
await wb.xlsx.writeFile(path!);
