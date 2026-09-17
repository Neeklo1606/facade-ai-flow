/**
 * Генерирует docs/db/schema.md и docs/db/schema.sql из описаний таблиц в src/contracts.
 * Запуск: bun run db:schema. Файлы в docs/db руками не правятся.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { enums, sqlName, tables, type ColumnMeta, type TableDef } from "../src/contracts";

const areas: { title: string; tables: string[] }[] = [
  {
    title: "Организация",
    tables: [
      "employees",
      "project_members",
      "counterparties",
      "supplier_profiles",
      "crews",
      "crew_members",
    ],
  },
  { title: "Объект и договор", tables: ["projects", "contracts", "milestones", "work_zones"] },
  {
    title: "Документация и спецификация",
    tables: [
      "documents",
      "document_revisions",
      "extraction_jobs",
      "document_sheets",
      "revision_changes",
      "materials",
      "positions",
      "position_changes",
      "replacement_suggestions",
    ],
  },
  {
    title: "Закупка",
    tables: [
      "email_templates",
      "supply_requests",
      "supply_request_lines",
      "supply_request_positions",
      "supply_request_recipients",
      "supplier_offers",
      "supplier_offer_lines",
      "deliveries",
      "delivery_lines",
      "project_decisions",
    ],
  },
  {
    title: "Площадка, происхождение, история",
    tables: [
      "field_reports",
      "field_report_issues",
      "evidence",
      "sources",
      "extractions",
      "project_events",
    ],
  },
];

const byName = new Map(tables.map((item) => [item.meta.name, item]));
const listed = new Set(areas.flatMap((area) => area.tables));
const missing = tables.filter((item) => !listed.has(item.meta.name)).map((item) => item.meta.name);
if (missing.length)
  throw new Error(`Таблицы без раздела в scripts/db-schema.ts: ${missing.join(", ")}`);
for (const def of tables) {
  for (const [key, column] of Object.entries(def.columns)) {
    if (column.references && !byName.has(column.references.table)) {
      throw new Error(
        `${def.meta.name}.${key} ссылается на неизвестную таблицу ${column.references.table}`,
      );
    }
  }
}

const esc = (text: string) => text.replace(/\|/g, "\\|");

function indexColumns(columns: string[]) {
  return columns
    .map((column) => {
      const [name, direction] = column.split(" ");
      return direction ? `${sqlName(name!)} ${direction}` : sqlName(name!);
    })
    .join(", ");
}

function columnSql(key: string, column: ColumnMeta) {
  const parts = [sqlName(key), column.sqlType];
  if (!column.nullable) parts.push("not null");
  if (column.default) parts.push(`default ${column.default}`);
  return parts.join(" ");
}

/* ---------- SQL ---------- */

function ddl() {
  const out: string[] = [
    "-- Сгенерировано scripts/db-schema.ts из src/contracts. Не редактировать вручную.",
    "-- Задание на схему PostgreSQL: таблицы, перечисления, ключи, индексы, проверки.",
    "",
    "create extension if not exists pgcrypto;",
    "",
  ];
  for (const item of enums) {
    out.push(`-- ${item.comment}`);
    out.push(
      `create type ${item.name} as enum (${item.values.map((v) => `'${v}'`).join(", ")});`,
      "",
    );
  }
  for (const def of tables) {
    const lines = Object.entries(def.columns).map(([key, column]) => `  ${columnSql(key, column)}`);
    if (def.meta.audited) {
      const own = new Set(Object.keys(def.columns).map(sqlName));
      const service = [
        "created_at timestamptz not null default now()",
        "updated_at timestamptz not null default now()",
        "created_by uuid",
      ].filter((line) => !own.has(line.split(" ")[0]!));
      lines.push(...service.map((line) => `  ${line}`));
    }
    lines.push(`  primary key (${def.meta.primaryKey.map(sqlName).join(", ")})`);
    for (const check of def.meta.checks ?? []) lines.push(`  check (${check})`);
    out.push(`-- ${def.meta.comment}${def.meta.appendOnly ? " (журнал: только insert)" : ""}`);
    out.push(`create table ${def.meta.name} (\n${lines.join(",\n")}\n);`);
    for (const [key, column] of Object.entries(def.columns)) {
      if (column.comment) {
        out.push(
          `comment on column ${def.meta.name}.${sqlName(key)} is '${column.comment.replace(/'/g, "''")}';`,
        );
      }
    }
    for (const index of def.meta.indexes) {
      const name = `${def.meta.name}_${index.columns.map((c) => sqlName(c.split(" ")[0]!)).join("_")}_${index.unique ? "key" : "idx"}`;
      const using = index.method === "gin" ? " using gin" : "";
      const where = index.where ? ` where ${index.where}` : "";
      out.push(
        `create ${index.unique ? "unique " : ""}index ${name} on ${def.meta.name}${using} (${indexColumns(index.columns)})${where}; -- ${index.purpose}`,
      );
    }
    out.push("");
  }
  out.push("-- Внешние ключи отдельно: между таблицами есть взаимные ссылки");
  for (const def of tables) {
    for (const [key, column] of Object.entries(def.columns)) {
      if (!column.references) continue;
      out.push(
        `alter table ${def.meta.name} add foreign key (${sqlName(key)}) references ${column.references.table} (id) on delete ${column.references.onDelete};`,
      );
    }
    if (def.meta.audited) {
      out.push(
        `alter table ${def.meta.name} add foreign key (created_by) references employees (id) on delete restrict;`,
      );
    }
  }
  const journals = tables.filter((def) => def.meta.appendOnly).map((def) => def.meta.name);
  out.push(
    "",
    "-- Журналы: роль приложения может только добавлять строки",
    ...journals.map((name) => `revoke update, delete on ${name} from app_user;`),
    "",
  );
  return out.join("\n");
}

/* ---------- Markdown ---------- */

function erDiagram(area: { title: string; tables: string[] }) {
  const lines = ["```mermaid", "erDiagram"];
  const inArea = new Set(area.tables);
  const external = new Set<string>();
  for (const name of area.tables) {
    const def = byName.get(name)!;
    for (const [key, column] of Object.entries(def.columns)) {
      const target = column.references?.table;
      if (!target) continue;
      if (!inArea.has(target)) external.add(target);
      const left = column.nullable ? "|o" : "||";
      lines.push(`  ${target} ${left}--o{ ${name} : ${sqlName(key)}`);
    }
  }
  for (const name of [...area.tables, ...external]) {
    const def = byName.get(name)!;
    if (!inArea.has(name)) {
      lines.push(`  ${name} {`, "    uuid id PK", "  }");
      continue;
    }
    lines.push(`  ${name} {`);
    for (const [key, column] of Object.entries(def.columns)) {
      const keys = [
        def.meta.primaryKey.includes(key) ? "PK" : "",
        column.references ? "FK" : "",
      ].filter(Boolean);
      const type = column.sqlType.replace(/[(),]/g, "_").replace(/\[\]/g, "_array");
      lines.push(`    ${type} ${sqlName(key)}${keys.length ? ` ${keys.join(",")}` : ""}`);
    }
    lines.push("  }");
  }
  lines.push("```");
  return lines.join("\n");
}

function tableSection(def: TableDef) {
  const { meta } = def;
  const out = [
    `#### \`${meta.name}\``,
    "",
    meta.comment + (meta.appendOnly ? ". **Журнал: только добавление.**" : "."),
    "",
  ];
  out.push("| Колонка | Тип | Пусто | Ссылка | Комментарий |", "|---|---|---|---|---|");
  for (const [key, column] of Object.entries(def.columns)) {
    const ref = column.references
      ? `→ \`${column.references.table}\` (${column.references.onDelete})`
      : "";
    const pk = meta.primaryKey.includes(key) ? " **PK**" : "";
    out.push(
      `| \`${sqlName(key)}\`${pk} | \`${column.sqlType}\` | ${column.nullable ? "да" : ""} | ${ref} | ${esc(column.comment ?? "")} |`,
    );
  }
  if (meta.audited)
    out.push(
      "| `created_at`, `updated_at`, `created_by` | служебные | | → `employees` | не отдаются в API |",
    );
  out.push("");
  if (meta.indexes.length) {
    out.push("| Индекс | Колонки | Для чего |", "|---|---|---|");
    for (const index of meta.indexes) {
      const kind = [index.unique ? "unique" : "", index.method === "gin" ? "gin" : ""]
        .filter(Boolean)
        .join(", ");
      out.push(
        `| ${kind || "btree"} | \`${indexColumns(index.columns)}\`${index.where ? ` where \`${index.where}\`` : ""} | ${esc(index.purpose)} |`,
      );
    }
    out.push("");
  }
  if (meta.checks?.length) {
    out.push("Проверки: " + meta.checks.map((check) => `\`${check}\``).join("; ") + ".", "");
  }
  return out.join("\n");
}

function markdown() {
  const out = [
    "# Схема базы данных",
    "",
    "> Сгенерировано `bun run db:schema` из `src/contracts`. Не редактировать вручную.",
    "> DDL — [schema.sql](schema.sql). Термины и формулы — [глоссарий](../domain/glossary.md), решение — [ADR-001](../adr/ADR-001-data-layer.md).",
    "",
    "## Соглашения",
    "",
    "- PostgreSQL 16. Имена таблиц и колонок — `snake_case`, в TypeScript — `camelCase`.",
    "- Первичные ключи `uuid` (`gen_random_uuid()`). Фикстуры используют читаемые ключи (`p-korona`) — адаптер БД их не принимает.",
    "- Внешние ключи с явным `on delete`: `restrict` для всего, что служит основанием (документы, позиции, запросы, решения); `cascade` — для строк, которые не живут без родителя (листы ревизии, строки запроса и предложения, состав бригады); `set null` — для необязательных ссылок на источник.",
    "- Деньги — `bigint` в копейках. Количества — `numeric(14,3)`. Доли и уверенность — `numeric(5,4)` от 0 до 1.",
    "- Время — `timestamptz`, даты без времени — `date`.",
    "- Статусы — перечисления; разрешённые переходы описаны ниже и проверяются в серверных функциях.",
    "- Изменяемые таблицы имеют `created_at`, `updated_at`, `created_by`. Журналы (`position_changes`, `project_decisions`, `project_events`, `sources`, `extractions`) только пополняются.",
    "- Сводка объекта (`project_overview`) — представление, а не таблица; формулы в глоссарии, §3.",
    "- Индексы подобраны под списки и фильтры экранов; колонка «Для чего» называет экран.",
    "- Фикстуры проверяются по этому описанию: `bun run check:fixtures` (схемы, ключи, уникальности, представления); на PostgreSQL — `psql -f docs/db/schema.sql` и `bun run db:fixtures-sql | psql`.",
    "",
    `Таблиц: ${tables.length}, перечислений: ${enums.length}.`,
    "",
    "## Перечисления",
    "",
    "| Тип | Значения | Переходы | Смысл |",
    "|---|---|---|---|",
    ...enums.map((item) => {
      const transitions = item.transitions
        ? Object.entries(item.transitions)
            .map(([from, to]) => `${from} → ${to.join(", ")}`)
            .join("; ")
        : "";
      return `| \`${item.name}\` | ${item.values.map((v) => `\`${v}\``).join(", ")} | ${esc(transitions)} | ${esc(item.comment)} |`;
    }),
    "",
  ];
  for (const area of areas) {
    out.push(`## ${area.title}`, "", erDiagram(area), "");
    for (const name of area.tables) out.push(tableSection(byName.get(name)!));
  }
  return out.join("\n");
}

mkdirSync("docs/db", { recursive: true });
writeFileSync("docs/db/schema.md", markdown());
writeFileSync("docs/db/schema.sql", ddl());
console.log(`docs/db: ${tables.length} таблиц, ${enums.length} перечислений`);
