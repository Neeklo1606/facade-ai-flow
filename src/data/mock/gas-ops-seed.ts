/**
 * Стартовый набор /gas на данных заказчика (ADR-043, ADR-047). Только личный контур
 * (`src/server/client-contour.ts`), тесты domain и скрипты сверки: клиентский код
 * строит набор из публичного отчёта (`public/seed.ts`).
 */
import { factReport } from "./fact-report";
import { buildSeedFrom, todayOf, yesterdayOf, type GasOpsSeed } from "./gas-ops-seed-core";
import type { ScenarioPlaces } from "./public/places";

export type { GasOpsSeed } from "./gas-ops-seed-core";

/** Пункты демо-объектов сценариев в неделе заказчика */
export const CUSTOMER_SCENARIO_PLACES: ScenarioPlaces = {
  main: "ст. Петровская",
  city: "г. Славянск н/К",
  farm: "х. Прикубанский",
};

/** Последний день недели отчёта: он же «сегодня» в демонстрации */
export const GAS_TODAY = todayOf(factReport);
/** Предыдущий день: нужен сценарию «ввод за вчера» (OPEN-QUESTION 5) */
export const GAS_YESTERDAY = yesterdayOf(factReport);

export function buildSeed(): GasOpsSeed {
  return buildSeedFrom(factReport, CUSTOMER_SCENARIO_PLACES);
}
