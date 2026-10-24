/**
 * Чтение файла сметы в браузере (ADR-053, раздел 1). Файл не уходит на сервер: он
 * превращается в сетку строк, а правила разбора живут в домене.
 *
 * Оба формата читает SheetJS CE 0.20.3 с cdn.sheetjs.com (версия закреплена в package.json):
 * xls (BIFF8) больше читать нечем, а держать в браузере ещё и exceljs ради xlsx — это 250 КБ
 * сверху. Модуль грузится отдельным куском только в момент выбора файла и меряется своим
 * порогом в scripts/bundle-budget.json (`onDemand`), общий бюджет экранов не растёт.
 */
import type { Cell, SheetGrid } from "@/domain/gas-ops/estimate-labels";

export class EstimateFileError extends Error {
  constructor(
    readonly code: "unsupported" | "reader-unavailable" | "unreadable",
    message: string,
  ) {
    super(message);
    this.name = "EstimateFileError";
  }
}

async function sheetsOf(buffer: ArrayBuffer, kind: "xls" | "xlsx"): Promise<SheetGrid[]> {
  let XLSX: typeof import("xlsx");
  try {
    XLSX = await import("xlsx");
  } catch {
    throw new EstimateFileError(
      "reader-unavailable",
      kind === "xls"
        ? "Старый формат .xls сейчас не читается. Сохраните смету как .xlsx и загрузите снова."
        : "Модуль чтения Excel не загрузился. Проверьте связь и попробуйте снова.",
    );
  }
  try {
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    return wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name]!;
      // Диапазон с A1, а не с первой заполненной ячейки: иначе номера строк в замечаниях
      // разошлись бы с номерами строк файла, которые видит сметчик
      const used = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
      const grid = used
        ? XLSX.utils.sheet_to_json<Cell[]>(ws, {
            header: 1,
            raw: true,
            defval: null,
            blankrows: true,
            range: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: used.e }),
          })
        : [];
      return { name, grid };
    });
  } catch {
    throw new EstimateFileError(
      "unreadable",
      kind === "xls"
        ? "Файл не читается как xls. Сохраните смету как .xlsx и загрузите снова."
        : "Файл не читается как xlsx. Проверьте, что он открывается в Excel.",
    );
  }
}

export function sheetsOfXlsx(buffer: ArrayBuffer): Promise<SheetGrid[]> {
  return sheetsOf(buffer, "xlsx");
}

export function sheetsOfXls(buffer: ArrayBuffer): Promise<SheetGrid[]> {
  return sheetsOf(buffer, "xls");
}

/** Прочитать файл сметы: формат по сигнатуре файла, а не по расширению */
export async function readEstimateFile(file: File): Promise<SheetGrid[]> {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 4));
  // xlsx — zip («PK»), xls — составной документ OLE (D0 CF 11 E0)
  if (head[0] === 0x50 && head[1] === 0x4b) return sheetsOfXlsx(buffer);
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0)
    return sheetsOfXls(buffer);
  throw new EstimateFileError("unsupported", "Нужен файл сметы Excel: .xlsx или .xls.");
}
