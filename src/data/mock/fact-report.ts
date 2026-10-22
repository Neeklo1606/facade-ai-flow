/**
 * Анонимизированная выгрузка фактического отчёта заказчика.
 * JSON собирает `scripts/parse-fact-report.ts` из `docs/source/fact-report.xlsx`
 * (реальный файл в git не попадает). Руками JSON не правим: его перезапишет скрипт.
 *
 * Данные заказчика (ADR-047): модуль импортируют только сервер (`src/server/client-contour.ts`),
 * тесты domain и скрипты сверки. Клиентский код работает на публичном наборе.
 */
import raw from "./fact-report.lite.json";
import type { FactReport, ShiftFrame } from "./fact-report-types";

export type {
  FactDayValue,
  FactEntry,
  FactNode,
  FactNodeKind,
  FactReport,
  ShiftFrame,
} from "./fact-report-types";

export const factReport = raw as unknown as FactReport;

/** Дни недели отчёта: 28.09 — 03.10.2026 */
export const factDays = factReport.meta.days;

export function shiftFrames(): ShiftFrame[] {
  return factReport.frames;
}
