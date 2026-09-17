import type { ExportColumn } from "@/domain/registry";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Файл .xlsx из колонок и строк. Универсальная сборка библиотеки работает и в Worker, и во вкладке:
 * сервер отдаёт файл выгрузки, демо-адаптер строит тот же файл у себя.
 */
export async function buildXlsx<T>(columns: ExportColumn<T>[], rows: T[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const header = columns.map((column) => ({ value: column.header, fontWeight: "bold" as const }));
  const body = rows.map((row) => columns.map((column) => ({ value: column.value(row) })));
  return writeXlsxFile([header, ...body], {
    columns: columns.map((column) => ({ width: column.width })),
    stickyRowsCount: 1,
  }).toBlob();
}
