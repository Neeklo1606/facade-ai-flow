import { sqlName, type ColumnMeta, type TableDef } from "@/contracts";
import type { TableRows } from "@/adapters/state/tables";
import type { KeyCodec } from "./codec";
import type { Driver, Statement } from "./driver";
import { holdsKeys, selectColumns, writeOrder } from "./schema";

/**
 * Таблицы целиком для моста снимка (ADR-005, п. 5): загрузка одним согласованным пакетом
 * и запись разницы одним атомарным пакетом с проверкой версии данных.
 */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

export interface Loaded {
  /** Версия данных `app_state.version` на момент загрузки */
  version: number;
  tables: TableRows;
  /** `row_order` строк по ключу строки — порядок в представлении (ADR-005, п. 8) */
  order: Map<string, Map<string, number>>;
}

/** Код ошибки, которым база отвечает на устаревшую версию: повторить действие на свежих данных */
export const STALE_VERSION = "40001";

const pkOf = (def: TableDef, row: Row) =>
  JSON.stringify(def.meta.primaryKey.map((key) => row[key]));

function translate(def: TableDef, row: Row, map: (key: string) => string): Row {
  const out: Row = { ...row };
  for (const [key, column] of Object.entries(def.columns)) {
    if (!holdsKeys(column)) continue;
    const value = out[key];
    if (typeof value === "string") out[key] = map(value);
    else if (Array.isArray(value)) out[key] = value.map((item) => map(String(item)));
  }
  return out;
}

/** Часть таблиц: условие `where` по псевдониму `t` для каждой нужной таблицы; остальные пусты */
export interface LoadScope {
  where: Partial<Record<keyof TableRows, string>>;
  values: unknown[];
}

/**
 * Загрузить таблицы одним согласованным пакетом. Без `scope` — все таблицы целиком (мост);
 * со `scope` — только названные и только подходящие строки (карточка объекта, справочник).
 */
export async function loadTables(
  driver: Driver,
  codec: KeyCodec,
  scope?: LoadScope,
): Promise<Loaded> {
  const loaded = writeOrder.filter((def) => !scope || def.meta.name in scope.where);
  const statements: Statement[] = [
    { text: "select version::float8 as version from app_state where id = 1" },
    ...loaded.map((def) => {
      const condition = scope?.where[def.meta.name as keyof TableRows];
      return {
        text: `select ${selectColumns(def, "t")}, t.row_order as "__order" from ${def.meta.name} t${condition ? ` where ${condition}` : ""} order by t.row_order, ${def.meta.primaryKey.map((key) => `t.${sqlName(key)}`).join(", ")}`,
        ...(condition?.includes("$1") ? { values: scope!.values } : {}),
      };
    }),
  ];
  const [versionRows, ...results] = await driver.batch(statements, { readOnly: true });
  const tables: Tables = Object.fromEntries(writeOrder.map((def) => [def.meta.name, []]));
  const order = new Map<string, Map<string, number>>();
  loaded.forEach((def, index) => {
    const own = new Map<string, number>();
    tables[def.meta.name] = results[index]!.map(({ __order, ...raw }) => {
      const row = translate(def, raw, codec.decode);
      own.set(pkOf(def, row), Number(__order));
      return row;
    });
    order.set(def.meta.name, own);
  });
  return {
    version: Number(versionRows?.[0]?.["version"] ?? 0),
    tables: tables as unknown as TableRows,
    order,
  };
}

/** Пустое состояние — для сида: всё, что есть в новых таблицах, будет вставлено */
export function emptyLoaded(version = 0): Loaded {
  const tables: Tables = Object.fromEntries(writeOrder.map((def) => [def.meta.name, []]));
  return { version, tables: tables as unknown as TableRows, order: new Map() };
}

/** Сравнение значений строки: ключи объектов в любом порядке (jsonb их переставляет) */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, index) => same(item, other[index]));
  }
  const left = Object.entries(a as Row).filter(([, value]) => value !== undefined);
  const right = b as Row;
  return (
    left.length === Object.values(right).filter((value) => value !== undefined).length &&
    left.every(([key, value]) => same(value, right[key]))
  );
}

/**
 * Порядок строк новой таблицы. Старые строки сохраняют `row_order`, новые встают между соседями.
 * Если старые строки переставлены или места между соседями нет — таблица нумеруется заново.
 */
export function assignOrder(keys: string[], previous: Map<string, number>): number[] {
  const renumber = () => keys.map((_, index) => index + 1);
  const known = keys.map((key) => previous.get(key));
  let last = -Infinity;
  for (const value of known) {
    if (value === undefined) continue;
    if (value <= last) return renumber();
    last = value;
  }
  const result: number[] = [];
  for (let index = 0; index < keys.length;) {
    const value = known[index];
    if (value !== undefined) {
      result.push(value);
      index += 1;
      continue;
    }
    // Серия новых строк между соседями
    let end = index;
    while (end < keys.length && known[end] === undefined) end += 1;
    const before = result.length ? result[result.length - 1]! : null;
    const after = end < keys.length ? known[end]! : null;
    const count = end - index;
    for (let k = 1; k <= count; k++) {
      if (before === null && after === null) result.push(k);
      else if (before === null) result.push(after! - (count - k + 1));
      else if (after === null) result.push(before + k);
      else result.push(before + ((after - before) * k) / (count + 1));
    }
    if (before !== null && after !== null && (after - before) / (count + 1) < 1e-9) {
      return renumber();
    }
    index = end;
  }
  return result;
}

const typed = (def: TableDef) => `jsonb_populate_recordset(null::${def.meta.name}, $1::jsonb)`;
const pkMatch = (def: TableDef, left: string, right: string) =>
  def.meta.primaryKey
    .map((key) => `${left}.${sqlName(key)} = ${right}.${sqlName(key)}`)
    .join(" and ");

/** Строка для записи: имена колонок базы, ключи в `uuid` */
function dbRow(def: TableDef, row: Row, codec: KeyCodec, rowOrder?: number) {
  const encoded = translate(def, row, codec.encode);
  const out: Row = {};
  for (const key of Object.keys(def.columns)) out[sqlName(key)] = encoded[key] ?? null;
  if (rowOrder !== undefined) out["row_order"] = rowOrder;
  return out;
}

/** Строки, ссылающиеся на свою же таблицу, — после тех, на кого ссылаются */
function selfSorted(def: TableDef, rows: { row: Row; order: number }[]) {
  const selfKey = Object.entries(def.columns).find(
    ([, column]: [string, ColumnMeta]) => column.references?.table === def.meta.name,
  )?.[0];
  if (!selfKey || def.meta.primaryKey.length !== 1) return rows;
  const pk = def.meta.primaryKey[0]!;
  const pending = new Map(rows.map((item) => [item.row[pk], item]));
  const out: typeof rows = [];
  const place = (item: (typeof rows)[number]) => {
    if (!pending.has(item.row[pk])) return;
    pending.delete(item.row[pk]);
    const parent = pending.get(item.row[selfKey]);
    if (parent) place(parent);
    out.push(item);
  };
  rows.forEach(place);
  return out;
}

/**
 * Пакет записи: переход от загруженных таблиц к новым. Первые два запроса — пояс сеанса
 * и проверка версии; дальше вставки и правки от родителей к детям, удаления — наоборот.
 * Пустой пакет — изменений нет.
 */
export function diffStatements(loaded: Loaded, next: TableRows, codec: KeyCodec): Statement[] {
  const before = loaded.tables as unknown as Tables;
  const after = next as unknown as Tables;
  const writes: Statement[] = [];
  const deletes: Statement[] = [];

  for (const def of writeOrder) {
    const name = def.meta.name;
    const oldRows = new Map((before[name] ?? []).map((row) => [pkOf(def, row), row]));
    const rows = after[name] ?? [];
    const keys = rows.map((row) => pkOf(def, row));
    const previousOrder = loaded.order.get(name) ?? new Map<string, number>();
    const orders = assignOrder(keys, previousOrder);

    const inserts: { row: Row; order: number }[] = [];
    const updates: Row[] = [];
    rows.forEach((row, index) => {
      const key = keys[index]!;
      const old = oldRows.get(key);
      const order = orders[index]!;
      if (!old) inserts.push({ row, order });
      else if (!same(old, row) || previousOrder.get(key) !== order) {
        updates.push(dbRow(def, row, codec, order));
      }
    });
    const kept = new Set(keys);
    const removed = [...oldRows.entries()].filter(([key]) => !kept.has(key));

    const columns = [...Object.keys(def.columns).map(sqlName), "row_order"];
    if (inserts.length) {
      writes.push({
        text: `insert into ${name} (${columns.join(", ")}) select ${columns.join(", ")} from ${typed(def)}`,
        values: [
          JSON.stringify(
            selfSorted(def, inserts).map((item) => dbRow(def, item.row, codec, item.order)),
          ),
        ],
      });
    }
    if (updates.length) {
      const pk = new Set(def.meta.primaryKey.map(sqlName));
      const set = columns.filter((column) => !pk.has(column)).map((c) => `${c} = r.${c}`);
      if (def.meta.audited) set.push("updated_at = now()");
      writes.push({
        text: `update ${name} t set ${set.join(", ")} from ${typed(def)} r where ${pkMatch(def, "t", "r")}`,
        values: [JSON.stringify(updates)],
      });
    }
    if (removed.length) {
      deletes.unshift({
        text: `delete from ${name} t using ${typed(def)} r where ${pkMatch(def, "t", "r")}`,
        values: [JSON.stringify(removed.map(([, row]) => dbRow(def, row, codec)))],
      });
    }
  }

  if (!writes.length && !deletes.length) return [];
  return [
    // Метки без пояса пишутся как момент UTC с теми же цифрами (ADR-005, п. 6)
    { text: "set local time zone 'UTC'" },
    { text: "select app_state_advance($1)", values: [loaded.version] },
    ...writes,
    ...deletes,
  ];
}
