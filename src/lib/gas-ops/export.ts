/**
 * Выгрузка отчёта из экрана: строки отправляются на сервер, оттуда приходит файл.
 * Экран не знает, чем собран файл, — это задача адаптера выгрузки.
 */
import { saveFile } from "@/lib/download";
import type { AnalyticRow, ReportMode, ReportRow } from "@/domain/gas-ops/report";

export interface DownloadInput {
  rows: ReportRow[];
  analytic: AnalyticRow[];
  days: string[];
  week: { from: string; to: string };
  mode: ReportMode;
}

const ru = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export async function downloadCustomerXlsx(input: DownloadInput): Promise<string> {
  const response = await fetch("/api/gas/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Сервер ответил ${response.status}: ${await response.text()}`);
  }
  const name = `Фактический отчёт ${ru(input.week.from)}-${ru(input.week.to)}.xlsx`;
  saveFile(await response.blob(), name);
  return name;
}
