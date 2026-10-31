/**
 * Файл запроса цены (ADR-057): лист «Запрос» с позициями заявки и пустыми столбцами цены
 * и срока, которые заполняет поставщик. Писем система не отправляет: файл скачивает человек.
 */
export interface RfqPayload {
  number: string;
  objectLabel: string;
  needBy: string | null;
  headers: string[];
  rows: (string | number)[][];
}

const WIDTHS = [6, 44, 8, 12, 22, 20, 28];

export async function buildRfqWorkbook(payload: RfqPayload): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Запрос");
  ws.addRow([`Запрос коммерческого предложения по заявке ${payload.number}`]).font = { bold: true };
  ws.addRow([`Объект: ${payload.objectLabel}`]);
  if (payload.needBy) {
    const d = payload.needBy;
    ws.addRow([`Нужно на объекте к ${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`]);
  }
  ws.addRow([]);
  const head = ws.addRow(payload.headers);
  head.font = { bold: true };
  for (const row of payload.rows) ws.addRow(row);
  WIDTHS.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });
  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
