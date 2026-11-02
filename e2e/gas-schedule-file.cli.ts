/**
 * Синтетический недельный график для e2e (ADR-061, 12): файл собирает bun, как и смету
 * (gas-estimate-file.cli.ts). Две строки графика и одна с нераспознанной датой.
 * `bun run e2e/gas-schedule-file.cli.ts <файл.xlsx>`
 */
import ExcelJS from "exceljs";

const [path] = process.argv.slice(2);
const wb = new ExcelJS.Workbook();
wb.addWorksheet("Пояснения").getCell("A1").value = "График на неделю 28.09-03.10";
const ws = wb.addWorksheet("График");
ws.addRow(["Объект", "Номер", "Бригада", "Дата"]);
ws.addRow(["ст. Демо-Северная, ул. Демо, 200 - котел", "ОБ-001", "Бригада 1", "03.10.2026"]);
ws.addRow(["г. Демо-Приречный, ул. Демо, 102 - котел, насос", "ОБ-002", "Бригада 4", "02.10.2026"]);
ws.addRow(["ул. Демо, 9", "ОБ-003", "Бригада 2", "завтра"]);
await wb.xlsx.writeFile(path!);
