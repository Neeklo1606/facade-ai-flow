/**
 * Начальные данные в пустую базу — те же фикстуры, что у демо (ADR-005, п. 3).
 * Запуск: DATABASE_URL=… bun run db:seed. Порядок — docs/runbook/database.md.
 */
import { createDriver, driverConfigFromEnv, fixtureCodec, seedDatabase } from "../src/adapters/db";

const config = driverConfigFromEnv(process.env);
if (!config) {
  console.error("Задайте DATABASE_URL — строку подключения к PostgreSQL");
  process.exit(1);
}
const driver = createDriver(config);
try {
  const started = performance.now();
  await seedDatabase(driver, fixtureCodec());
  const [row] = await driver.query<{ n: number }>("select count(*)::int as n from positions");
  console.log(
    `Сид загружен за ${Math.round(performance.now() - started)} мс: позиций ${row?.n ?? 0}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await driver.close();
}
