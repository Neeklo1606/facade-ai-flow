/**
 * Адаптер фикстур: демо-данные в форме таблиц PostgreSQL и представления для экранов.
 * Импортировать можно только из слоя данных (`src/lib/spec-store.ts`, `scripts/`),
 * экранам и компонентам запрещено линт-правилом (ADR-001, п. 5).
 */
export { buildSnapshot, type FixtureSnapshot } from "./views";
export { fixtureTables, type FixtureTables } from "./tables";
export { simulatedPositions, sheetsOf } from "./spec";
