/**
 * SQL и схема mermaid модулей сервиса v1 из контрактов `src/contracts/gas.ts` (ADR-060).
 * Миграция `db/migrations/20261031100000_gas_service_v1.sql` — вывод `gasMigration()`;
 * миграция T7 `db/migrations/20261103100000_gas_tabel_t7.sql` — вывод `gasT7Migration()`.
 * Тест tests/db/gas-contracts.test.ts держит файлы равными выводу, `check:db` — базу равной контрактам.
 */
import { enums, sqlName, type ColumnMeta, type TableDef } from "../src/contracts";
import {
  GAS_T7_COLUMNS,
  GAS_WAVE_F_COLUMNS,
  gasTabelTables,
  gasTables,
} from "../src/contracts/gas";

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

const enumNamesOf = (defs: TableDef[]) =>
  new Set(
    defs.flatMap((def) =>
      Object.values(def.columns)
        .map((column) => column.enumName)
        .filter((name): name is string => Boolean(name)),
    ),
  );

const gasEnumNames = enumNamesOf(gasTables);

export const gasEnums = enums.filter((item) => gasEnumNames.has(item.name));

/** Колонки таблицы v1: без тех, что добавляют миграции T7 и волны F */
const v1Columns = (def: TableDef) =>
  Object.entries(def.columns).filter(
    ([key]) =>
      !GAS_T7_COLUMNS[def.meta.name]?.includes(key) &&
      !GAS_WAVE_F_COLUMNS[def.meta.name]?.includes(key),
  );

function commentSql(table: string, key: string, column: ColumnMeta): string[] {
  return column.comment
    ? [`comment on column ${table}.${q(sqlName(key))} is '${column.comment.replace(/'/g, "''")}';`]
    : [];
}

function tableSql(def: TableDef, columns = Object.entries(def.columns)): string[] {
  const lines = columns.map(([key, column]) => `  ${columnSql(key, column)}`);
  lines.push("  row_order double precision not null default 0");
  lines.push(`  primary key (${def.meta.primaryKey.map((k) => q(sqlName(k))).join(", ")})`);
  for (const check of def.meta.checks ?? []) lines.push(`  check (${check})`);
  const out = [
    `-- ${def.meta.comment}${def.meta.appendOnly ? " (журнал: только insert)" : ""}`,
    `create table ${def.meta.name} (\n${lines.join(",\n")}\n);`,
  ];
  for (const [key, column] of columns) out.push(...commentSql(def.meta.name, key, column));
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
  for (const def of gasTables) out.push(...tableSql(def, v1Columns(def)), "");
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

function foreignKeys(defs: TableDef[], all: TableDef[]): string[] {
  const out: string[] = [];
  for (const def of defs) {
    for (const [key, column] of Object.entries(def.columns)) {
      if (!column.references) continue;
      const target = all.find((t) => t.meta.name === column.references!.table)!;
      out.push(
        `alter table ${def.meta.name} add foreign key (${q(sqlName(key))}) references ${target.meta.name} (${q(sqlName(target.meta.primaryKey[0]!))}) on delete ${column.references.onDelete};`,
      );
    }
  }
  return out;
}

/**
 * Миграция T7 (ADR-061, 14): канал MAX, уведомления, график и поля признаков записи.
 * Черновик для B2 и B6: применяется после v1 и откатывается без потери данных v1
 */
export function gasT7Migration(): string {
  const names = enumNamesOf(gasTabelTables);
  const own = enums.filter((item) => names.has(item.name) && !gasEnumNames.has(item.name));
  const out: string[] = [
    "-- migrate:up",
    "-- Табель T7 (ADR-061, 14): привязка MAX, диалоги бота, входящие события, уведомления, график.",
    "-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.",
    "",
  ];
  for (const item of own) {
    out.push(`-- ${item.comment}`);
    out.push(`create type ${item.name} as enum (${item.values.map((v) => `'${v}'`).join(", ")});`);
  }
  out.push("");
  for (const [table, keys] of Object.entries(GAS_T7_COLUMNS)) {
    const def = gasTables.find((t) => t.meta.name === table)!;
    for (const key of keys) {
      const column = def.columns[key]!;
      out.push(`alter table ${table} add column ${columnSql(key, column)};`);
      out.push(...commentSql(table, key, column));
    }
  }
  out.push("");
  for (const def of gasTabelTables) out.push(...tableSql(def), "");
  out.push("-- Внешние ключи", ...foreignKeys(gasTabelTables, [...gasTables, ...gasTabelTables]));
  const journals = gasTabelTables.filter((def) => def.meta.appendOnly).map((def) => def.meta.name);
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
    ...[...gasTabelTables].reverse().map((def) => `drop table if exists ${def.meta.name} cascade;`),
    ...Object.entries(GAS_T7_COLUMNS).flatMap(([table, keys]) =>
      keys.map((key) => `alter table ${table} drop column if exists ${q(sqlName(key))};`),
    ),
    ...[...own].reverse().map((item) => `drop type if exists ${item.name};`),
    "",
  );
  return out.join("\n");
}

/** Миграция волны F (ADR-062): телефон бригады для импорта справочников (F3) */
export function gasWaveFMigration(): string {
  const out: string[] = [
    "-- migrate:up",
    "-- Волна F (ADR-062): телефон бригады из импорта справочников.",
    "-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.",
    "",
  ];
  for (const [table, keys] of Object.entries(GAS_WAVE_F_COLUMNS)) {
    const def = [...gasTables, ...gasTabelTables].find((t) => t.meta.name === table)!;
    for (const key of keys) {
      const column = def.columns[key]!;
      out.push(`alter table ${table} add column ${columnSql(key, column)};`);
      out.push(...commentSql(table, key, column));
    }
  }
  out.push(
    "",
    "-- migrate:down",
    ...Object.entries(GAS_WAVE_F_COLUMNS).flatMap(([table, keys]) =>
      keys.map((key) => `alter table ${table} drop column if exists ${q(sqlName(key))};`),
    ),
    "",
  );
  return out.join("\n");
}

/** Схема связей для docs/BACKEND_HANDOFF.md: таблицы и ключи без колонок */
export function gasMermaid(): string {
  const lines = ["```mermaid", "erDiagram"];
  for (const def of [...gasTables, ...gasTabelTables]) {
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
