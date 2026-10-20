/**
 * Помощник e2e отчёта на bun. Playwright в Node не читает JSON-модули набора без атрибута
 * импорта и не грузит exceljs из подключённых симлинком зависимостей, поэтому:
 * — `bun run e2e/gas-report-state.cli.ts` печатает снимок вкладки и строки сверки;
 * — `bun run e2e/gas-report-state.cli.ts read <файл.xlsx>` печатает итог листа «Отчёт».
 */
import ExcelJS from "exceljs";
import { reconcileLinesOf } from "@/api/gas-report";
import { reportState } from "./gas-report-state";

const [command, path] = process.argv.slice(2);

if (command === "read" && path) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const sheet = book.getWorksheet("Отчёт")!;
  const last = sheet.getRow(sheet.rowCount);
  const value = last.getCell(5 + 6 * 3).value as { result?: number } | number;
  process.stdout.write(
    JSON.stringify({
      label: String(last.getCell(1).value),
      amount: typeof value === "number" ? value : (value.result ?? 0),
      sheets: book.worksheets.map((ws) => ws.name),
    }),
  );
} else {
  const state = reportState();
  const entries = (
    JSON.parse(state) as { snapshot: { entries: Parameters<typeof reconcileLinesOf>[0] } }
  ).snapshot.entries;
  process.stdout.write(JSON.stringify({ state, lines: reconcileLinesOf(entries) }));
}
