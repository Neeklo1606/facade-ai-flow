/**
 * Выгружает фикстуры в SQL для проверки на настоящем PostgreSQL:
 *   bun run db:schema && psql -f docs/db/schema.sql && bun scripts/fixtures-sql.ts | psql
 * Читаемые ключи фикстур (`p-korona`) превращаются в детерминированные uuid.
 */
import { sqlName, tables, type TableDef } from "../src/contracts";
import { fixtureTables } from "../src/adapters/fixtures/tables";
import { keyUuid as uuid } from "../src/adapters/db/codec";

const data = fixtureTables as unknown as Record<string, Record<string, unknown>[]>;

const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;

function literal(value: unknown, sqlType: string) {
  if (value === null || value === undefined) return "null";
  if (sqlType === "uuid") return quote(uuid(String(value)));
  if (sqlType === "jsonb") return `${quote(JSON.stringify(value))}::jsonb`;
  if (sqlType === "text[]") {
    return `array[${(value as string[]).map(quote).join(", ")}]::text[]`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return quote(String(value));
}

// Порядок вставки: сначала таблицы, на которые ссылаются
const order: TableDef[] = [];
const visiting = new Set<string>();
const byName = new Map(tables.map((def) => [def.meta.name, def]));
function visit(def: TableDef) {
  if (order.includes(def)) return;
  if (visiting.has(def.meta.name)) throw new Error(`Цикл внешних ключей через ${def.meta.name}`);
  visiting.add(def.meta.name);
  for (const column of Object.values(def.columns)) {
    const target = column.references?.table;
    if (target && target !== def.meta.name) visit(byName.get(target)!);
  }
  visiting.delete(def.meta.name);
  order.push(def);
}
tables.forEach(visit);

const out = ["begin;"];
for (const def of order) {
  const rows = [...(data[def.meta.name] ?? [])];
  // Строки со ссылкой на свою же таблицу — после тех, на кого ссылаются
  const selfColumn = Object.entries(def.columns).find(
    ([, c]) => c.references?.table === def.meta.name,
  )?.[0];
  if (selfColumn)
    rows.sort((a, b) => Number(a[selfColumn] !== null) - Number(b[selfColumn] !== null));
  const columns = Object.keys(def.columns);
  for (let i = 0; i < rows.length; i += 200) {
    const values = rows
      .slice(i, i + 200)
      .map((row) => `(${columns.map((c) => literal(row[c], def.columns[c]!.sqlType)).join(", ")})`);
    out.push(
      `insert into ${def.meta.name} (${columns.map(sqlName).join(", ")}) values\n${values.join(",\n")};`,
    );
  }
}
out.push("commit;");
console.log(out.join("\n"));
