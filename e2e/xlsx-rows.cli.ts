/**
 * Синтетический xlsx для e2e импорта справочников (ADR-062, F3). Playwright в Node не грузит
 * exceljs (см. gas-estimate-file.cli.ts), поэтому файл собирает bun.
 * `bun run e2e/xlsx-rows.cli.ts <файл.xlsx> '<JSON строк>'` — один лист, строки как есть.
 */
import ExcelJS from "exceljs";

const [path, json] = process.argv.slice(2);
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Лист1");
for (const line of JSON.parse(json!) as (string | number | null)[][]) ws.addRow(line);
await wb.xlsx.writeFile(path!);
