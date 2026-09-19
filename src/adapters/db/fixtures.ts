import { tables } from "@/contracts";
import { fixtureTables } from "@/adapters/fixtures/tables";
import { buildSnapshot, snapshotTables } from "@/adapters/state/assemble";
import { createKeyCodec, type KeyCodec } from "./codec";
import type { Driver } from "./driver";
import { diffStatements, emptyLoaded } from "./store";
import { holdsKeys } from "./schema";

/**
 * Что адаптер БД берёт из фикстур (ADR-005, пп. 3, 4, 9): ключи для таблицы соответствий
 * и начальные данные для сида. Больше фикстуры ему не нужны.
 */

/** Кодек, знающий все читаемые ключи фикстур */
export function fixtureCodec(): KeyCodec {
  const data = fixtureTables as unknown as Record<string, Record<string, unknown>[]>;
  const keys = new Set<string>();
  for (const def of tables) {
    const columns = Object.entries(def.columns).filter(([, column]) => holdsKeys(column));
    for (const row of data[def.meta.name] ?? []) {
      for (const [key] of columns) {
        const value = row[key];
        if (typeof value === "string") keys.add(value);
        else if (Array.isArray(value)) value.forEach((item) => keys.add(String(item)));
      }
    }
  }
  return createKeyCodec(keys);
}

/**
 * Сид: те же фикстуры, что у демо, пропущенные через сборщик состояния. В базу ложатся
 * уже пересчитанные производные поля, как их пишет мост (ADR-005, п. 11). Только в пустую базу.
 */
export async function seedDatabase(driver: Driver, codec: KeyCodec) {
  const [present] = await driver.query<{ n: number }>("select count(*)::int as n from projects");
  if (present && present.n > 0) {
    throw new Error("В базе уже есть данные: сид загружается только в пустую базу");
  }
  const [state] = await driver.query<{ version: number }>(
    "select version::float8 as version from app_state where id = 1",
  );
  const statements = diffStatements(
    emptyLoaded(state?.version ?? 0),
    snapshotTables(buildSnapshot(fixtureTables)),
    codec,
  );
  await driver.batch(statements);
  const rows = statements.length;
  return { statements: rows };
}
