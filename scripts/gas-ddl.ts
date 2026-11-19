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
  GAS_AUTOPILOT_COLUMNS,
  GAS_ACCRUAL_COLUMNS,
  GAS_ACCRUAL_TABLES,
  GAS_INTAKE_COLUMNS,
  GAS_INTAKE_TABLES,
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

const intake = new Set<string>(GAS_INTAKE_TABLES);
const accrual = new Set<string>(GAS_ACCRUAL_TABLES);
/** Таблицы v1: без тех, что добавляют миграции ADR-077 и ADR-078 */
const v1Tables = gasTables.filter(
  (def) => !intake.has(def.meta.name) && !accrual.has(def.meta.name),
);
const intakeTables = gasTables.filter((def) => intake.has(def.meta.name));
const accrualTables = gasTables.filter((def) => accrual.has(def.meta.name));

const gasEnumNames = enumNamesOf(gasTables);

export const gasEnums = enums.filter((item) => gasEnumNames.has(item.name));

/** Колонки таблицы v1: без тех, что добавляют миграции T7 и волны F */
const v1Columns = (def: TableDef) =>
  Object.entries(def.columns).filter(
    ([key]) =>
      !GAS_T7_COLUMNS[def.meta.name]?.includes(key) &&
      !GAS_WAVE_F_COLUMNS[def.meta.name]?.includes(key) &&
      !GAS_AUTOPILOT_COLUMNS[def.meta.name]?.includes(key) &&
      !GAS_INTAKE_COLUMNS[def.meta.name]?.includes(key) &&
      !GAS_ACCRUAL_COLUMNS[def.meta.name]?.includes(key),
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
  for (const def of v1Tables) out.push(...tableSql(def, v1Columns(def)), "");
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
  for (const def of v1Tables) {
    for (const [key, column] of Object.entries(def.columns)) {
      if (!column.references) continue;
      const target = v1Tables.find((t) => t.meta.name === column.references!.table)!;
      out.push(
        `alter table ${def.meta.name} add foreign key (${q(sqlName(key))}) references ${target.meta.name} (${q(sqlName(target.meta.primaryKey[0]!))}) on delete ${column.references.onDelete};`,
      );
    }
  }
  const journals = v1Tables.filter((def) => def.meta.appendOnly).map((def) => def.meta.name);
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
    ...[...v1Tables].reverse().map((def) => `drop table if exists ${def.meta.name} cascade;`),
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
  return addColumnsMigration(
    "-- Волна F (ADR-062): телефон бригады из импорта справочников.",
    GAS_WAVE_F_COLUMNS,
  );
}

/** Автопилот (ADR-070): решение автопилота в записи. Только добавление колонки, данные не трогаются */
export function gasAutopilotMigration(): string {
  return addColumnsMigration(
    "-- Автопилот проверки (ADR-070): решение автопилота в записи времени.",
    GAS_AUTOPILOT_COLUMNS,
  );
}

function addColumnsMigration(title: string, columns: Record<string, readonly string[]>): string {
  const out: string[] = [
    "-- migrate:up",
    title,
    "-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.",
    "",
  ];
  for (const [table, keys] of Object.entries(columns)) {
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
    ...Object.entries(columns).flatMap(([table, keys]) =>
      keys.map((key) => `alter table ${table} drop column if exists ${q(sqlName(key))};`),
    ),
    "",
  );
  return out.join("\n");
}

/**
 * Миграция ADR-077: сметы, версии смет, файлы смет и разделы объектов — своими таблицами.
 * Сметы и версии переносятся из строки gas_state (jsonb) и убираются из неё в той же миграции:
 * данные не теряются, откат собирает их обратно. Время в jsonb — местное без пояса, переводится
 * в поясе Europe/Moscow, как у хранилища по умолчанию (APP_TIME_ZONE)
 */
/** Необязательные ключи версии: при откате `null` не пишется ключом, как было в gas_state */
const VERSION_OPTIONAL_SQL = ["extras", "corrections", "header", "fileId"]
  .map((k) => ` - (case when v."${k}" is null then '${k}' else '' end)`)
  .join("");

export function gasIntakeMigration(): string {
  const out: string[] = [
    "-- migrate:up",
    "-- Папка смет на сервисе (ADR-077): сметы, версии, файлы и разделы объектов в таблицах.",
    "-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.",
    "",
  ];
  for (const [table, keys] of Object.entries(GAS_INTAKE_COLUMNS)) {
    const def = gasTables.find((t) => t.meta.name === table)!;
    for (const key of keys) {
      out.push(`alter table ${table} add column ${columnSql(key, def.columns[key]!)};`);
      out.push(...commentSql(table, key, def.columns[key]!));
    }
  }
  out.push("");
  for (const def of intakeTables) out.push(...tableSql(def), "");
  out.push("-- Внешние ключи", ...foreignKeys(intakeTables, gasTables), "");
  const zone = "'Europe/Moscow'";
  const ts = (expr: string) => `((${expr})::timestamp at time zone ${zone})`;
  out.push(
    "-- Перенос из gas_state: порядок массива сохраняется в row_order",
    "insert into gas_estimates (id, object_id, version, amount_rub, status, origin, confirmed_by, confirmed_at, note, source, row_order)",
    `select e->>'id', e->>'objectId', (e->>'version')::int, (e->>'amountRub')::int, e->>'status', e->>'origin', e->>'confirmedBy', ${ts("e->>'confirmedAt'")}, e->>'note', (e->>'source')::gas_source, t.ord - 1`,
    "from gas_state, jsonb_array_elements(coalesce(state->'estimates', '[]'::jsonb)) with ordinality as t(e, ord)",
    "where key = 'main';",
    "",
    "insert into gas_estimate_versions (id, object_id, version, file_name, sheet, uploaded_at, uploaded_by, format, parse_status, totals, vat_rate, labor_hours, sections, extras, issues, header, issues_reviewed_by, confirmed_by, confirmed_at, corrections, file_id, row_order)",
    `select v->>'id', v->>'objectId', (v->>'version')::int, v->>'fileName', v->>'sheet', ${ts("v->>'uploadedAt'")}, coalesce(v->>'uploadedBy', ''), v->>'format', v->>'parseStatus', coalesce(v->'totals', '{}'::jsonb), (v->>'vatRate')::float8, nullif(v->'laborHours', 'null'::jsonb), coalesce(v->'sections', '[]'::jsonb), nullif(v->'extras', 'null'::jsonb), coalesce(v->'issues', '[]'::jsonb), nullif(v->'header', 'null'::jsonb), v->>'issuesReviewedBy', v->>'confirmedBy', ${ts("v->>'confirmedAt'")}, nullif(v->'corrections', 'null'::jsonb), v->>'fileId', t.ord - 1 - jsonb_array_length(coalesce(state->'estimateVersions', '[]'::jsonb))`,
    "from gas_state, jsonb_array_elements(coalesce(state->'estimateVersions', '[]'::jsonb)) with ordinality as t(v, ord)",
    "where key = 'main';",
    "",
    "update gas_state set state = state - 'estimates' - 'estimateVersions' where key = 'main';",
    "",
    "-- migrate:down",
    "-- Сметы и версии обратно в gas_state, затем таблицы удаляются",
    "update gas_state set state = state",
    "  || jsonb_build_object('estimates', coalesce((select jsonb_agg(to_jsonb(e) - 'row_order' order by e.row_order) from (",
    `    select id, object_id as "objectId", version, amount_rub as "amountRub", status, origin, confirmed_by as "confirmedBy", to_char(confirmed_at at time zone ${zone}, 'YYYY-MM-DD"T"HH24:MI:SS') as "confirmedAt", note, source::text as source, row_order from gas_estimates) e), '[]'::jsonb))`,
    `  || jsonb_build_object('estimateVersions', coalesce((select jsonb_agg(to_jsonb(v) - 'row_order'${VERSION_OPTIONAL_SQL} order by v.row_order) from (`,
    `    select id, object_id as "objectId", version, file_name as "fileName", sheet, to_char(uploaded_at at time zone ${zone}, 'YYYY-MM-DD"T"HH24:MI:SS') as "uploadedAt", uploaded_by as "uploadedBy", format, parse_status as "parseStatus", totals, vat_rate as "vatRate", labor_hours as "laborHours", sections, extras, issues, header, issues_reviewed_by as "issuesReviewedBy", confirmed_by as "confirmedBy", to_char(confirmed_at at time zone ${zone}, 'YYYY-MM-DD"T"HH24:MI:SS') as "confirmedAt", corrections, file_id as "fileId", row_order from gas_estimate_versions) v), '[]'::jsonb))`,
    "where key = 'main';",
    ...[...intakeTables].reverse().map((def) => `drop table if exists ${def.meta.name} cascade;`),
    ...Object.entries(GAS_INTAKE_COLUMNS).flatMap(([table, keys]) =>
      keys.map((key) => `alter table ${table} drop column if exists ${q(sqlName(key))};`),
    ),
    "",
  );
  return out.join("\n");
}

/**
 * Миграция ADR-078: назначения разделов бригадам, история доли выполнения, раздел, ответ
 * бригадира и начисление в записи времени. Новые таблицы пустые, колонки допускают null:
 * существующие записи остаются как были, их сумма по старому правилу не меняется
 */
export function gasAccrualMigration(): string {
  const out: string[] = [
    "-- migrate:up",
    "-- Доля выполнения раздела и начисление (ADR-078): назначения, история доли, начисление записи.",
    "-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.",
    "",
  ];
  for (const [table, keys] of Object.entries(GAS_ACCRUAL_COLUMNS)) {
    const def = gasTables.find((t) => t.meta.name === table)!;
    for (const key of keys) {
      out.push(`alter table ${table} add column ${columnSql(key, def.columns[key]!)};`);
      out.push(...commentSql(table, key, def.columns[key]!));
    }
  }
  out.push("");
  for (const def of accrualTables) out.push(...tableSql(def), "");
  out.push("-- Внешние ключи", ...foreignKeys(accrualTables, gasTables), "");
  out.push(
    "-- migrate:down",
    ...[...accrualTables].reverse().map((def) => `drop table if exists ${def.meta.name} cascade;`),
    ...Object.entries(GAS_ACCRUAL_COLUMNS).flatMap(([table, keys]) =>
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
