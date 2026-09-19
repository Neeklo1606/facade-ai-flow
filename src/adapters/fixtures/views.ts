import { fixtureTables } from "./tables";
import { buildSnapshot as assemble, type FixtureSnapshot } from "@/adapters/state/assemble";

/**
 * Состояние демо из фикстур. Сборка и обратное преобразование живут в `adapters/state`:
 * ими пользуется и адаптер PostgreSQL, которому данные фикстур не нужны (ADR-005, ADR-013).
 */
export { snapshotTables, type FixtureSnapshot } from "@/adapters/state/assemble";

export function buildSnapshot(t = fixtureTables): FixtureSnapshot {
  return assemble(t);
}
