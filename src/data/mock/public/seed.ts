/**
 * Публичный набор «Демо-подрядчик» (ADR-047): отчёт той же формы, что у заказчика,
 * с вымышленными населёнными пунктами и суммами. Его и только его импортирует клиентский код /gas.
 * Файл JSON строит `bun run data:public`, руками не правится.
 */
import raw from "./fact-report.public.json";
import type { FactReport } from "../fact-report-types";
import { buildSeedFrom, todayOf, type GasOpsSeed } from "../gas-ops-seed-core";
import { PUBLIC_SCENARIO_PLACES } from "./places";

export const publicReport = raw as unknown as FactReport;

export const PUBLIC_TODAY = todayOf(publicReport);

export function buildPublicSeed(): GasOpsSeed {
  return buildSeedFrom(publicReport, PUBLIC_SCENARIO_PLACES);
}
