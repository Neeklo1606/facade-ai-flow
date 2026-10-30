/**
 * Записать миграцию модулей сервиса v1 из контрактов (ADR-060). Запуск: `bun run db:gas-schema`.
 * Повторный запуск перезаписывает тот же файл: миграция ещё не применялась ни к одной рабочей базе.
 */
import { writeFileSync } from "node:fs";
import { gasMigration } from "./gas-ddl";

export const GAS_MIGRATION = "db/migrations/20261031100000_gas_service_v1.sql";

writeFileSync(GAS_MIGRATION, gasMigration());
console.log(GAS_MIGRATION);
