/**
 * Выгрузка отчёта из экрана: строки отправляются на сервер, оттуда приходит файл.
 * Экран не знает, чем собран файл, — это задача адаптера выгрузки.
 *
 * Файл сохраняется через blob и `<a download>`: у такой ссылки браузер берёт имя
 * из атрибута, а не из заголовка ответа. Поэтому имя читается из Content-Disposition
 * (`filename*`, потом `filename`) и ставится в атрибут; без заголовка — то же правило имени.
 */
import { saveFile } from "@/lib/download";
import {
  gasReportFileName,
  type AnalyticRow,
  type FileLabel,
  type ReportMode,
  type ReportRow,
} from "@/domain/gas-ops/report";

export interface DownloadInput {
  rows: ReportRow[];
  analytic: AnalyticRow[];
  days: string[];
  week: { from: string; to: string };
  mode: ReportMode;
  label?: FileLabel;
}

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

export async function downloadCustomerXlsx(input: DownloadInput): Promise<string> {
  const response = await fetch("/api/gas/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Сервер ответил ${response.status}: ${await response.text()}`);
  }
  const name =
    fileNameFromDisposition(response.headers.get("content-disposition")) ??
    gasReportFileName(input.week, input.label);
  saveFile(await response.blob(), name);
  return name;
}
