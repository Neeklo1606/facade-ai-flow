/**
 * Выгрузка недельного отчёта в XLSX «как у заказчика» (ADR-043).
 *
 * Что повторяется из исходного файла: объединённые заголовки дней, три показателя
 * под каждым днём, колонка «Итого», группировка строк уровнями (outline), подпись строки
 * в объединённых ячейках A:D.
 *
 * Чем файл отличается от исходного и почему:
 *
 * 1. В исходном файле формул нет вовсе — это выгрузка. Здесь итоги групп, бригад
 *    и сотрудников стоят формулами `SUM` по дочерним строкам: открыв файл, заказчик
 *    видит, из чего сложился итог, и может сам проверить.
 * 2. Доходность адресной строки записана значением: система считает её от минут,
 *    а минут в листе нет. Доходность итоговых строк записана формулой от суммы и часов
 *    той же строки, поэтому на половине рубля она может отличаться от значения в системе
 *    ровно на рубль. Это описано на листе «Как считалось».
 * 3. Лист «Записи» — плоская таблица всех записей отчёта.
 */
import type { ReportRow } from "@/domain/gas-ops/report";
import type { AnalyticRow } from "@/domain/gas-ops/report";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ExportPayload {
  rows: ReportRow[];
  analytic: AnalyticRow[];
  days: string[];
  week: { from: string; to: string };
  mode: "confirmed" | "preliminary";
}

const DAY_WIDTH = 3;
/** Первая колонка дня: подпись строки занимает A:D */
const FIRST_DAY_COL = 5;

const ru = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

function columnLetter(index: number): string {
  let rest = index;
  let name = "";
  while (rest > 0) {
    const mod = (rest - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    rest = Math.floor((rest - mod) / 26);
  }
  return name;
}

/** Строки-дети уровнем ниже, идущие подряд до следующей строки того же или высшего уровня */
function childRowNumbers(rows: ReportRow[], index: number, excelRows: number[]): number[] {
  const parent = rows[index];
  if (!parent) return [];
  const result: number[] = [];
  for (let i = index + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.level <= parent.level) break;
    if (row.kind === "frame") continue;
    if (row.level === parent.level + 1) result.push(excelRows[i]!);
  }
  return result;
}

export async function buildCustomerWorkbook(payload: ExportPayload): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ГАЙКА AI, газовое направление";
  wb.created = new Date();

  const ws = wb.addWorksheet("Отчёт", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 2 }],
    properties: { outlineLevelRow: 3 },
  });

  const totalCol = FIRST_DAY_COL + payload.days.length * DAY_WIDTH;
  const lastCol = totalCol + DAY_WIDTH - 1;

  // --- шапка: дни объединёнными ячейками, под каждым три показателя ---
  ws.mergeCells(1, 1, 2, 4);
  ws.getCell(1, 1).value = "Бригада и адрес";
  for (const [index, day] of payload.days.entries()) {
    const col = FIRST_DAY_COL + index * DAY_WIDTH;
    ws.mergeCells(1, col, 1, col + 2);
    ws.getCell(1, col).value = ru(day);
  }
  ws.mergeCells(1, totalCol, 1, totalCol + 2);
  ws.getCell(1, totalCol).value = "Итого";

  const heads = ["Сумма начислений", "Эффективное рабочее время (ч.)", "Доходность часа"];
  for (let col = FIRST_DAY_COL; col <= lastCol; col += DAY_WIDTH) {
    for (const [offset, title] of heads.entries()) ws.getCell(2, col + offset).value = title;
  }
  for (const rowNumber of [1, 2]) {
    const row = ws.getRow(rowNumber);
    row.font = { bold: true };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.height = rowNumber === 2 ? 34 : 20;
  }

  ws.getColumn(1).width = 46;
  for (let col = 2; col <= 4; col++) ws.getColumn(col).width = 2;
  for (let col = FIRST_DAY_COL; col <= lastCol; col++) {
    ws.getColumn(col).width = col % DAY_WIDTH === FIRST_DAY_COL % DAY_WIDTH ? 16 : 14;
  }

  // --- строки отчёта ---
  const excelRows: number[] = [];
  let cursor = 3;
  for (const row of payload.rows) {
    excelRows.push(cursor);
    cursor += 1;
  }

  for (const [index, row] of payload.rows.entries()) {
    const rowNumber = excelRows[index]!;
    const sheetRow = ws.getRow(rowNumber);
    ws.mergeCells(rowNumber, 1, rowNumber, 4);
    ws.getCell(rowNumber, 1).value = row.kind === "frame" ? "" : row.label;
    ws.getCell(rowNumber, 1).alignment = { indent: row.level * 2, vertical: "middle" };
    // Уровень группировки: как в файле заказчика, итог сворачивается над детьми
    sheetRow.outlineLevel = Math.min(row.level, 7);

    const children = row.kind === "total" ? [] : childRowNumbers(payload.rows, index, excelRows);
    const aggregate = children.length > 0;

    for (const [dayIndex] of payload.days.entries()) {
      const col = FIRST_DAY_COL + dayIndex * DAY_WIDTH;
      const cell = row.days[dayIndex];
      if (!cell) continue;
      if (row.kind === "frame") {
        if (cell.frame) {
          ws.mergeCells(rowNumber, col, rowNumber, col + 2);
          ws.getCell(rowNumber, col).value = cell.frame;
          ws.getCell(rowNumber, col).alignment = { horizontal: "center" };
        }
        continue;
      }
      writeTriple(ws, rowNumber, col, cell, aggregate ? children : null);
    }

    if (row.kind === "frame") {
      ws.mergeCells(rowNumber, totalCol, rowNumber, totalCol + 2);
      ws.getCell(rowNumber, totalCol).value = row.frameTotalText ?? "";
      ws.getCell(rowNumber, totalCol).alignment = { horizontal: "center" };
    } else if (row.kind === "total") {
      // Строка «Итого» складывает только строки групп: агрегаты не складываются с детьми
      const groupRows = payload.rows
        .map((item, i) => (item.kind === "group" ? excelRows[i]! : null))
        .filter((value): value is number => value !== null);
      writeTriple(ws, rowNumber, totalCol, row.total, groupRows);
    } else {
      writeTriple(ws, rowNumber, totalCol, row.total, aggregate ? children : null);
    }

    if (row.kind === "group" || row.kind === "total") sheetRow.font = { bold: true };
  }

  // --- лист «Записи» ---
  const flat = wb.addWorksheet("Записи", { views: [{ state: "frozen", ySplit: 1 }] });
  flat.columns = [
    { header: "Номер", key: "number", width: 12 },
    { header: "Дата", key: "day", width: 12 },
    { header: "Подразделение", key: "group", width: 28 },
    { header: "Бригада", key: "brigade", width: 18 },
    { header: "Сотрудник", key: "employee", width: 20 },
    { header: "Объект", key: "object", width: 44 },
    { header: "Вид работ", key: "work", width: 18 },
    { header: "Минуты", key: "minutes", width: 10 },
    { header: "Часы", key: "hours", width: 10 },
    { header: "Сумма начислений", key: "amount", width: 18 },
    { header: "Доходность часа", key: "rate", width: 16 },
    { header: "Статус", key: "status", width: 18 },
    { header: "Источник данных", key: "source", width: 18 },
  ];
  flat.getRow(1).font = { bold: true };
  for (const row of payload.analytic) {
    flat.addRow({
      number: row.number,
      day: ru(row.day),
      group: row.groupName,
      brigade: row.brigadeName,
      employee: row.employeeName,
      object: row.objectLabel,
      work: row.workType ?? "",
      minutes: row.minutes,
      hours: Math.round(row.hours * 100) / 100,
      amount: row.amountRub ?? "",
      rate: row.revenue ?? "",
      status: row.status,
      source: row.source === "fact-report" ? "факт из отчёта" : "демо",
    });
  }

  // --- лист «Как считалось» ---
  const notes = wb.addWorksheet("Как считалось");
  notes.getColumn(1).width = 110;
  const lines = [
    `Неделя ${ru(payload.week.from)} — ${ru(payload.week.to)}.`,
    payload.mode === "confirmed"
      ? "В отчёт включены только подтверждённые записи."
      : "Предварительный отчёт: включены записи, которые ещё не проверил человек.",
    "",
    "Правила расчёта:",
    "1. Эффективное время = окончание минус начало минус перерывы. Считается в минутах.",
    "2. Часы = минуты / 60, показываются с двумя знаками.",
    "3. Доходность часа = сумма / (минуты / 60), округление до рубля.",
    "4. Доходность адресной строки записана значением и посчитана от минут.",
    "   Доходность итоговых строк записана формулой от суммы и часов этой же строки:",
    "   на половине рубля она может отличаться от значения в системе ровно на рубль.",
    "5. Итоги групп, бригад и сотрудников — формулы SUM по дочерним строкам.",
    "   Агрегат не складывается с детьми: строка группы это сумма её бригад.",
    "6. Строка рамки смены показывает границу дня и не несёт денег и часов работы.",
    "7. Строка без суммы остаётся без суммы: доходность по ней не считается.",
    "",
    "Данные обезличены: ФИО заменены на роли, улица и дом — на «ул. Демо, N».",
    "Населённый пункт, вид работ, суммы, часы и интервалы перенесены из отчёта заказчика.",
  ];
  for (const line of lines) notes.addRow([line]);

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/** Три ячейки показателя: сумма, часы, доходность. Для агрегатов — формулы SUM */
function writeTriple(
  ws: import("exceljs").Worksheet,
  rowNumber: number,
  col: number,
  cell: { amountRub: number | null; minutes: number | null; revenue: number | null },
  children: number[] | null,
): void {
  const amount = ws.getCell(rowNumber, col);
  const hours = ws.getCell(rowNumber, col + 1);
  const rate = ws.getCell(rowNumber, col + 2);

  if (children && children.length > 0) {
    const amountRefs = children.map((n) => `${columnLetter(col)}${n}`).join(",");
    const hoursRefs = children.map((n) => `${columnLetter(col + 1)}${n}`).join(",");
    amount.value = { formula: `SUM(${amountRefs})`, result: cell.amountRub ?? 0 };
    hours.value = {
      formula: `SUM(${hoursRefs})`,
      result: cell.minutes === null ? 0 : Math.round((cell.minutes / 60) * 100) / 100,
    };
    rate.value = {
      formula: `IF(${columnLetter(col + 1)}${rowNumber}=0,"",ROUND(${columnLetter(col)}${rowNumber}/${columnLetter(col + 1)}${rowNumber},0))`,
      result: cell.revenue ?? 0,
    };
  } else {
    if (cell.amountRub !== null) amount.value = cell.amountRub;
    if (cell.minutes !== null) hours.value = Math.round((cell.minutes / 60) * 100) / 100;
    if (cell.revenue !== null) rate.value = cell.revenue;
  }

  amount.numFmt = "# ##0";
  hours.numFmt = "0.00";
  rate.numFmt = "# ##0";
  for (const item of [amount, hours, rate]) item.alignment = { horizontal: "right" };
}

export function customerFileName(week: { from: string; to: string }): string {
  return `Фактический отчёт ${ru(week.from)}-${ru(week.to)}.xlsx`;
}
