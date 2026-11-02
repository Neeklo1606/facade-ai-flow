/**
 * Выгрузка недели из экрана: вид, версия и данные недели уходят на сервер, оттуда приходит
 * файл. Экран не знает, чем собран файл, — это задача адаптера выгрузки.
 *
 * Файл сохраняется через blob и `<a download>`: у такой ссылки браузер берёт имя
 * из атрибута, а не из заголовка ответа. Поэтому имя читается из Content-Disposition
 * (`filename*`, потом `filename`) и ставится в атрибут; без заголовка — то же правило имени.
 */
import { saveFile } from "@/lib/download";
import type { GasExportRequest } from "@/api/gas-export";
import { gasReportFileName } from "@/domain/gas-ops/report";

/** Имя файла из Content-Disposition: `filename*` (RFC 5987) важнее `filename` */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // Испорченная кодировка: остаётся запасное имя
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain?.[1]?.trim() || null;
}

/**
 * Выгрузка недели (ADR-061, 11): экран называет вид и версию и отдаёт данные недели,
 * строки файла сервер считает сам
 */
export async function downloadWeekXlsx(input: GasExportRequest): Promise<string> {
  const response = await fetch("/api/gas/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Сервер ответил ${response.status}: ${await response.text()}`);
  }
  const label =
    input.version != null
      ? { version: input.version }
      : input.kind === "draft"
        ? { draft: true as const }
        : null;
  const name =
    fileNameFromDisposition(response.headers.get("content-disposition")) ??
    gasReportFileName(input.week, label);
  saveFile(await response.blob(), name);
  return name;
}
