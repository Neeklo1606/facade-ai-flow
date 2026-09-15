export interface XlsxColumn<T> {
  header: string;
  width: number;
  value: (row: T) => string | number;
}

/** Выгрузка реестра в .xlsx. Библиотека грузится только по нажатию кнопки. */
export async function exportXlsx<T>(fileName: string, columns: XlsxColumn<T>[], rows: T[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = columns.map((column) => ({ value: column.header, fontWeight: "bold" as const }));
  const body = rows.map((row) => columns.map((column) => ({ value: column.value(row) })));
  await writeXlsxFile([header, ...body], {
    columns: columns.map((column) => ({ width: column.width })),
    stickyRowsCount: 1,
  }).toFile(fileName);
}
