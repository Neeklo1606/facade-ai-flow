/**
 * Записать миграцию модулей сервиса v1 из контрактов (ADR-060). Запуск: `bun run db:gas-schema`.
 * Повторный запуск перезаписывает те же файлы: миграции ещё не применялись ни к одной рабочей базе.
 */
import { writeFileSync } from "node:fs";
import { gasAutopilotMigration, gasMigration, gasT7Migration, gasWaveFMigration } from "./gas-ddl";

export const GAS_MIGRATION = "db/migrations/20261031100000_gas_service_v1.sql";
/** Табель T7 (ADR-061, 14): своя миграция поверх v1 */
export const GAS_T7_MIGRATION = "db/migrations/20261103100000_gas_tabel_t7.sql";
/** Волна F (ADR-062): телефон бригады */
export const GAS_WAVE_F_MIGRATION = "db/migrations/20261104100000_gas_wave_f.sql";
/** Автопилот (ADR-070): решение автопилота в записи */
export const GAS_AUTOPILOT_MIGRATION = "db/migrations/20261115100000_gas_autopilot.sql";

writeFileSync(GAS_MIGRATION, gasMigration());
writeFileSync(GAS_T7_MIGRATION, gasT7Migration());
writeFileSync(GAS_WAVE_F_MIGRATION, gasWaveFMigration());
writeFileSync(GAS_AUTOPILOT_MIGRATION, gasAutopilotMigration());
console.log(GAS_MIGRATION);
console.log(GAS_T7_MIGRATION);
console.log(GAS_WAVE_F_MIGRATION);
console.log(GAS_AUTOPILOT_MIGRATION);
