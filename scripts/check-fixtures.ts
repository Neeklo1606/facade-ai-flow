/**
 * Проверяет фикстуры по контрактам: схема строки, первичный ключ, внешние ключи,
 * уникальные индексы (включая частичные `x is not null`). Запуск: bun run check:fixtures.
 */
import type { z } from "zod";
import * as contracts from "../src/contracts";
import { tables } from "../src/contracts";
import { buildSnapshot, fixtureTables, type FixtureSnapshot } from "../src/adapters/fixtures";
import { projectOverview } from "../src/domain/overview";
import { MOCK_NOW } from "../src/lib/format";

const data = fixtureTables as unknown as Record<string, Record<string, unknown>[]>;
const problems: string[] = [];
const byName = new Map(tables.map((def) => [def.meta.name, def]));

for (const name of Object.keys(data)) {
  if (!byName.has(name)) problems.push(`Фикстура ${name} не описана в contracts`);
}

for (const def of tables) {
  const rows = data[def.meta.name];
  if (!rows) {
    problems.push(`Нет фикстур для таблицы ${def.meta.name}`);
    continue;
  }

  rows.forEach((row, index) => {
    const parsed = def.schema.safeParse(row);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      problems.push(`${def.meta.name}[${index}] ${issue.path.join(".")}: ${issue.message}`);
    }
  });

  const keyOf = (row: Record<string, unknown>, columns: string[]) =>
    columns.map((column) => JSON.stringify(row[column.split(" ")[0]!])).join("|");

  const checkUnique = (columns: string[], label: string, where?: string) => {
    const seen = new Set<string>();
    for (const row of rows) {
      const notNullColumn = where?.match(/^(\w+) is not null$/)?.[1];
      if (notNullColumn) {
        const key = notNullColumn.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
        if (row[key] === null) continue;
      } else if (where) {
        continue;
      }
      const key = keyOf(row, columns);
      if (seen.has(key))
        problems.push(`${def.meta.name}: повтор ${label} (${columns.join(", ")}) = ${key}`);
      seen.add(key);
    }
  };

  checkUnique(def.meta.primaryKey, "первичного ключа");
  for (const index of def.meta.indexes.filter((item) => item.unique)) {
    checkUnique(index.columns, "уникального индекса", index.where);
  }

  for (const [column, meta] of Object.entries(def.columns)) {
    if (!meta.references) continue;
    const target = data[meta.references.table] ?? [];
    const ids = new Set(target.map((row) => row["id"]));
    for (const row of rows) {
      const value = row[column];
      if (value === null || value === undefined) continue;
      if (!ids.has(value)) {
        problems.push(
          `${def.meta.name}.${column} = ${String(value)}: нет строки в ${meta.references.table}`,
        );
      }
    }
  }
}

/* ---------- Представления: снимок для экранов проходит схемы представлений ---------- */

const snapshot = buildSnapshot();
const viewSchemas: Partial<Record<keyof FixtureSnapshot, z.ZodTypeAny>> = {
  employees: contracts.employeeView,
  crews: contracts.crewView,
  projects: contracts.projectView,
  milestones: contracts.milestoneView,
  zones: contracts.workZoneView,
  documents: contracts.projectDocument,
  sheets: contracts.documentSheet,
  positions: contracts.extractedPosition,
  requests: contracts.supplyRequest,
  deliveries: contracts.delivery,
  decisions: contracts.projectDecision,
  reports: contracts.fieldReport,
};
for (const [key, schema] of Object.entries(viewSchemas)) {
  const rows = snapshot[key as keyof FixtureSnapshot] as unknown[];
  rows.forEach((row, index) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      problems.push(`представление ${key}[${index}] ${issue.path.join(".")}: ${issue.message}`);
    }
  });
}

/* ---------- Сводка объекта: формулы глоссария на фикстурах ---------- */

for (const project of snapshot.projects) {
  const overview = projectOverview(snapshot, project.id, MOCK_NOW);
  const parsed = contracts.projectOverview.safeParse(overview);
  if (!parsed.success) problems.push(`сводка ${project.id}: ${parsed.error.issues[0]!.message}`);
  else if (overview!.specUnverified > overview!.specTotal) {
    problems.push(`сводка ${project.id}: непроверенных больше, чем всего`);
  }
}

const total = Object.values(data).reduce((acc, rows) => acc + rows.length, 0);
if (problems.length) {
  console.error(problems.slice(0, 60).join("\n"));
  console.error(`\n${problems.length} нарушений в фикстурах`);
  process.exit(1);
}
console.log(`Фикстуры в порядке: ${tables.length} таблиц, ${total} строк`);
