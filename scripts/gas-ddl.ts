/**
 * SQL и схема mermaid модулей сервиса v1 из контрактов `src/contracts/gas.ts` (ADR-060).
 * Миграция `db/migrations/20261031100000_gas_service_v1.sql` — вывод `gasMigration()`;
 * тест tests/db/gas-ddl.test.ts держит файл равным выводу, `check:db` — базу равной контрактам.
 */
import { enums, sqlName, type ColumnMeta, type TableDef } from "../src/contracts";
import { gasTables } from "../src/contracts/gas";

const q = (name: string) => `"${name}"`;

function columnSql(key: string, column: ColumnMeta) {
  const parts = [q(sqlName(key)), column.sqlType];
  if (!column.nullable) parts.push("not null");
  if (column.default) parts.push(`default ${column.default}`);
  return parts.join(" ");
}

function indexColumns(columns: string[]) {
  return columns
    .map((column) => {
      const [name, direction] = column.split(" ");
      return direction ? `${q(sqlName(name!))} ${direction}` : q(sqlName(name!));
    })
    .join(", ");
}

const gasEnumNames = new Set(
  gasTables.flatMap((def) =>
    Object.values(def.columns)
      .map((column) => column.enumName)
      .filter((name): name is string => Boolean(name)),
  ),
);

export const gasEnums = enums.filter((item) => gasEnumNames.has(item.name));

function tableSql(def: TableDef): string[] {
  const lines = Object.entries(def.columns).map(([key, column]) => `  ${columnSql(key, column)}`);
  lines.push("  row_order double precision not null default 0");
  lines.push(`  primary key (${def.meta.primaryKey.map((k) => q(sqlName(k))).join(", ")})`);
  for (const check of def.meta.checks ?? []) lines.push(`  check (${check})`);
  const out = [
    `-- ${def.meta.comment}${def.meta.appendOnly ? " (журнал: только insert)" : ""}`,
    `create table ${def.meta.name} (\n${lines.join(",\n")}\n);`,
  ];
  for (const [key, column] of Object.entries(def.columns)) {
    if (column.comment) {
      out.push(
        `comment on column ${def.meta.name}.${q(sqlName(key))} is '${column.comment.replace(/'/g, "''")}';`,
      );
    }
  }
  for (const index of def.meta.indexes) {
    const name = `${def.meta.name}_${index.columns.map((c) => sqlName(c.split(" ")[0]!)).join("_")}_${index.unique ? "key" : "idx"}`;
    const where = index.where ? ` where ${index.where}` : "";
    out.push(
      `create ${index.unique ? "unique " : ""}index ${name} on ${def.meta.name} (${indexColumns(index.columns)})${where}; -- ${index.purpose}`,
    );
  }
  return out;
}

export function gasMigration(): string {
  const out: string[] = [
    "-- migrate:up",
    "-- Модули сервиса v1 (ADR-060): учёт времени бригад, снабжение, исполнительная документация.",
    "-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.",
    "",
  ];
  for (const item of gasEnums) {
    out.push(`-- ${item.comment}`);
    out.push(`create type ${item.name} as enum (${item.values.map((v) => `'${v}'`).join(", ")});`);
  }
  out.push("");
  for (const def of gasTables) out.push(...tableSql(def), "");
  out.push(
    "-- Версия состояния модулей: каждая запись хранилища увеличивает её при совпадении прежней",
    "-- (src/adapters/gas-ops/db-store.ts). Инфраструктура, а не данные домена: вне контрактов",
    "create table gas_versions (",
    "  key text primary key,",
    "  version integer not null default 0",
    ");",
    "insert into gas_versions (key, version) values ('main', 0);",
    "",
  );
  out.push("-- Внешние ключи");
  for (const def of gasTables) {
    for (const [key, column] of Object.entries(def.columns)) {
      if (!column.references) continue;
      const target = gasTables.find((t) => t.meta.name === column.references!.table)!;
      out.push(
        `alter table ${def.meta.name} add foreign key (${q(sqlName(key))}) references ${target.meta.name} (${q(sqlName(target.meta.primaryKey[0]!))}) on delete ${column.references.onDelete};`,
      );
    }
  }
  const journals = gasTables.filter((def) => def.meta.appendOnly).map((def) => def.meta.name);
  out.push(
    "",
    "-- Журналы: роль приложения может только добавлять строки (если роль заведена)",
    "do $$ begin",
    "  if exists (select 1 from pg_roles where rolname = 'app_user') then",
    ...journals.map((name) => `    revoke update, delete on ${name} from app_user;`),
    "  end if;",
    "end $$;",
    "",
    "-- migrate:down",
    "drop table if exists gas_versions;",
    ...[...gasTables].reverse().map((def) => `drop table if exists ${def.meta.name} cascade;`),
    ...[...gasEnums].reverse().map((item) => `drop type if exists ${item.name};`),
    "",
  );
  return out.join("\n");
}

/** Схема связей для docs/BACKEND_HANDOFF.md: таблицы и ключи без колонок */
export function gasMermaid(): string {
  const lines = ["```mermaid", "erDiagram"];
  for (const def of gasTables) {
    for (const [key, column] of Object.entries(def.columns)) {
      const target = column.references?.table;
      if (!target) continue;
      lines.push(
        `  ${target} ${column.nullable ? "|o" : "||"}--o{ ${def.meta.name} : ${sqlName(key)}`,
      );
    }
  }
  lines.push("```");
  return lines.join("\n");
}
