/**
 * Выгрузка недельного отчёта в XLSX «как у заказчика» (ADR-043, ADR-044 F6).
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
 * 2. Часы записаны точным значением минуты / 60 с форматом 0.00: видно 6,58, внутри 6,5833.
 *    Поэтому доходность итоговых строк формулой `ROUND(E/F,0)` совпадает с системой.
 *    Доходность адресной строки записана значением, посчитанным от минут.
 * 3. Лист «Записи» — плоская таблица тех же записей, что под строками листа «Отчёт».
 * 4. Набор строк тот же, что на экране при текущих переключателях: режим и «скрыть пустые».
 */
import { gasReportFileName, type AnalyticRow, type ReportRow } from "@/domain/gas-ops/report";

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

/**
 * Строки-дети по связи в дереве, а не по уровню: строка рамки смены стоит на уровне
 * сотрудника, и по уровню она обрывала бы его адреса — итог сотрудника выходил значением.
 */
function childRowNumbers(rows: ReportRow[], index: number, excelRows: number[]): number[] {
  const parent = rows[index];
  if (!parent) return [];
  const result: number[] = [];
  for (const [i, row] of rows.entries()) {
    if (row.parentId === parent.id && row.kind !== "frame") result.push(excelRows[i]!);
  }
  return result;
}

export async function buildCustomerWorkbook(payload: ExportPayload): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ГАЙКА AI, газовое направление";
  wb.created = new Date();

  const ws = wb.addWorksheet("Отчёт", {
    // Закрепление E3: подпись строки и обе строки шапки дней остаются на месте
    views: [{ state: "frozen", xSplit: 4, ySplit: 2, topLeftCell: "E3" }],
    properties: { outlineLevelRow: 3 },
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      // По ширине на одну страницу, по высоте сколько выйдет
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
  // Заголовки повторяются на каждой странице печати: шапка дней и подпись строки
  ws.pageSetup.printTitlesRow = "1:2";
  ws.pageSetup.printTitlesColumn = "A:D";

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

  // Ширина по содержимому: подпись строки с отступом уровня, числа по самому длинному
  const labelWidth = Math.max(
    16,
    ...payload.rows.map((row) => row.label.length + row.level * 2 + 2),
  );
  ws.getColumn(1).width = Math.min(labelWidth, 70);
  for (let col = 2; col <= 4; col++) ws.getColumn(col).width = 2;
  const cellsOf = (row: ReportRow) => [...row.days, row.total];
  const widest = (pick: (cell: ReportRow["total"]) => string) =>
    Math.max(...payload.rows.flatMap((row) => cellsOf(row).map((cell) => pick(cell).length)));
  const widths = [
    widest((c) => (c.frame ? c.frame : c.amountRub === null ? "" : group(c.amountRub))),
    widest((c) => (c.minutes === null ? "" : (c.minutes / 60).toFixed(2))),
    widest((c) => (c.revenue === null ? "" : group(c.revenue))),
  ];
  for (let col = FIRST_DAY_COL; col <= lastCol; col++) {
    const offset = (col - FIRST_DAY_COL) % DAY_WIDTH;
    // Подпись шапки переносится на две строки: по ширине её половина, а не вся длина
    ws.getColumn(col).width = Math.max(11, (widths[offset] ?? 8) + 3);
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
  flat.getColumn("hours").numFmt = "0.00";
  flat.getColumn("amount").numFmt = "# ##0";
  flat.getColumn("rate").numFmt = "# ##0";
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
      hours: row.minutes / 60,
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
    `Неделя ${ru(payload.week.from)} - ${ru(payload.week.to)}.`,
    payload.mode === "confirmed"
      ? "В отчёт включены только подтверждённые записи."
      : "Предварительный отчёт: включены записи, которые ещё не проверил человек.",
    "",
    "Правила расчёта:",
    "1. Эффективное время = окончание минус начало минус перерывы. Считается в минутах.",
    "2. Часы = минуты / 60. В ячейке точное значение, формат показывает два знака:",
    "   видно 6,58, внутри 6,5833 (395 мин).",
    "3. Доходность часа = сумма / (минуты / 60), округление до рубля.",
    "4. Доходность адресной строки записана значением и посчитана от минут.",
    "   Доходность итоговых строк записана формулой ROUND(сумма / часы; 0) этой же строки.",
    "   Часы точные, поэтому формула даёт то же значение, что система.",
    "5. Итоги групп, бригад и сотрудников — формулы SUM по дочерним строкам.",
    "   Агрегат не складывается с детьми: строка группы это сумма её бригад.",
    "6. Строка рамки смены показывает границу дня и не несёт денег и часов работы.",
    "7. Строка без суммы остаётся без суммы: доходность по ней не считается.",
    "8. Набор строк тот же, что на экране при выгрузке: режим отчёта и «скрыть пустые».",
    "",
    "Открытый вопрос 7 (правило округления половины рубля):",
    "   две строки по 14 700 ₽ за 160 мин (2,67 ч) дают ровно 5 512,5 ₽/ч.",
    "   В файле заказчика стоит 5 512, система и Excel округляют арифметически: 5 513.",
    "   Формулы под файл не подгонялись, правило согласует заказчик.",
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
      result: cell.minutes === null ? 0 : cell.minutes / 60,
    };
    const e = `${columnLetter(col)}${rowNumber}`;
    const f = `${columnLetter(col + 1)}${rowNumber}`;
    // Без суммы или без часов доходности нет: пустая ячейка, как прочерк на экране
    rate.value = {
      formula: `IF(OR(${e}=0,${f}=0),"",ROUND(${e}/${f},0))`,
      result: cell.revenue ?? "",
    };
  } else {
    if (cell.amountRub !== null) amount.value = cell.amountRub;
    // Точное значение: формат показывает два знака, а ROUND(E/F,0) считает от минут
    if (cell.minutes !== null) hours.value = cell.minutes / 60;
    if (cell.revenue !== null) rate.value = cell.revenue;
  }

  amount.numFmt = "# ##0";
  hours.numFmt = "0.00";
  rate.numFmt = "# ##0";
  for (const item of [amount, hours, rate]) item.alignment = { horizontal: "right" };
}

/** Имя файла: «Выработка_бригад_28.09-03.10.2026.xlsx» */
export function customerFileName(week: { from: string; to: string }): string {
  return gasReportFileName(week);
}

/** «1 524 132»: оценка ширины столбца по тому, как число видно в ячейке */
function group(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}
