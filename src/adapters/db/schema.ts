import { sqlName, tables, type ColumnMeta, type TableDef } from "@/contracts";

/** Порядок таблиц для записи: сначала те, на кого ссылаются. Удаление — в обратном порядке */
export const writeOrder: TableDef[] = (() => {
  const order: TableDef[] = [];
  const visiting = new Set<string>();
  const byName = new Map(tables.map((def) => [def.meta.name, def]));
  const visit = (def: TableDef) => {
    if (order.includes(def)) return;
    if (visiting.has(def.meta.name)) throw new Error(`Цикл внешних ключей через ${def.meta.name}`);
    visiting.add(def.meta.name);
    for (const column of Object.values(def.columns)) {
      const target = column.references?.table;
      if (target && target !== def.meta.name) visit(byName.get(target)!);
    }
    visiting.delete(def.meta.name);
    order.push(def);
  };
  tables.forEach(visit);
  return order;
})();

/** Колонка хранит ключи строк: `uuid` или помеченная `holdsIds` (ADR-005, п. 9) */
export const holdsKeys = (column: ColumnMeta) => column.sqlType === "uuid" || column.holdsIds;

/** Колонка в `select`: метки и даты — строкой без сдвига пояса, числа — числом */
export function selectColumn(alias: string, key: string, column: ColumnMeta) {
  const name = `${alias}.${sqlName(key)}`;
  const as = `"${key}"`;
  if (column.sqlType === "timestamptz") {
    return `to_char(${name} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as ${as}`;
  }
  if (column.sqlType === "date") return `to_char(${name}, 'YYYY-MM-DD') as ${as}`;
  if (column.sqlType.startsWith("numeric") || column.sqlType === "bigint") {
    return `${name}::float8 as ${as}`;
  }
  if (column.sqlType === "uuid") return `${name}::text as ${as}`;
  return `${name} as ${as}`;
}

export const selectColumns = (def: TableDef, alias: string) =>
  Object.entries(def.columns)
    .map(([key, column]) => selectColumn(alias, key, column))
    .join(", ");
