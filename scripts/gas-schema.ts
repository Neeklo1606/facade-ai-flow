/**
 * Записать миграцию модулей сервиса v1 из контрактов (ADR-060). Запуск: `bun run db:gas-schema`.
 * Повторный запуск перезаписывает те же файлы: миграции ещё не применялись ни к одной рабочей базе.
 */
import { writeFileSync } from "node:fs";
import { gasMigration, gasT7Migration } from "./gas-ddl";

export const GAS_MIGRATION = "db/migrations/20261031100000_gas_service_v1.sql";
/** Табель T7 (ADR-061, 14): своя миграция поверх v1 */
export const GAS_T7_MIGRATION = "db/migrations/20261103100000_gas_tabel_t7.sql";

writeFileSync(GAS_MIGRATION, gasMigration());
writeFileSync(GAS_T7_MIGRATION, gasT7Migration());
console.log(GAS_MIGRATION);
console.log(GAS_T7_MIGRATION);
