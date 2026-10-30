/**
 * Сиды демо модулей сервиса v1 в PostgreSQL (ADR-060): публичный набор «Демо-подрядчик»
 * пишется хранилищем базы. Только в пустую базу: данные заказчика сюда не попадают.
 * Запуск: DATABASE_URL=… bun run db:gas-seed (после bun run db:migrate).
 */
import { createDriver, driverConfigFromEnv } from "../src/adapters/db/driver";
import { createGasDbStore } from "../src/adapters/gas-ops/db-store";
import { getServerSnapshot } from "../src/adapters/gas-ops/state";

const config = driverConfigFromEnv(process.env);
if (!config) {
  console.error("db:gas-seed: задайте DATABASE_URL");
  process.exit(1);
}
const db = createDriver(config);
try {
  const [row] = await db.query<{ count: number }>("select count(*)::int as count from gas_objects");
  const count = row?.count ?? 0;
  if (count > 0) {
    console.error(`db:gas-seed: в базе уже ${count} объектов, сид пишется только в пустую`);
    process.exit(1);
  }
  const seed = getServerSnapshot();
  await createGasDbStore(db, { timeZone: process.env["APP_TIME_ZONE"] || "Europe/Moscow" }).seed(
    seed,
  );
  console.log(
    `db:gas-seed: объектов ${seed.objects.length}, записей времени ${seed.entries.length}, заявок ${seed.supply.requests.length}, работ ${seed.docs.works.length}`,
  );
} finally {
  await db.close();
}
