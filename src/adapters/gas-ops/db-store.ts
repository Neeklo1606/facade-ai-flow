/**
 * Хранилище модулей сервиса v1 в PostgreSQL (ADR-060). Тот же «мост снимка», что у адаптера
 * базы основного приложения (ADR-005): таблицы читаются одним согласованным чтением, правила
 * выполняет тот же код порта, разница пишется одним пакетом с проверкой версии.
 *
 * Версия — строка `gas_state`: пакет начинается с её увеличения при совпадении прежнего
 * значения. Если между чтением и записью успел записать другой процесс, пакет откатывается
 * целиком, и изменение повторяется на свежем снимке.
 *
 * Время в базе — `timestamptz`, в домене — местное время без пояса: перевод в поясе
 * `APP_TIME_ZONE` (по умолчанию Europe/Moscow), как у основного адаптера.
 */
import { sqlName, type ColumnMeta, type TableDef } from "@/contracts";
import { gasTables } from "@/contracts/gas";
import type { Driver, Statement } from "@/adapters/db/driver";
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import { PREPENDED, rowsToSnapshot, snapshotToRows, type GasRows, type Row } from "./db-codec";
import { GasStaleError, type GasStore } from "./store";

const q = (name: string) => `"${name}"`;

function selectExpr(key: string, column: ColumnMeta, zone: string): string {
  const name = q(sqlName(key));
  switch (column.sqlType) {
    case "timestamptz":
      return `to_char(${name} at time zone '${zone}', 'YYYY-MM-DD"T"HH24:MI:SS') as ${q(key)}`;
    case "date":
      return `to_char(${name}, 'YYYY-MM-DD') as ${q(key)}`;
    case "bigint":
    case "double precision":
      return `${name}::float8 as ${q(key)}`;
    default:
      return column.sqlType.startsWith("numeric")
        ? `${name}::float8 as ${q(key)}`
        : `${name} as ${q(key)}`;
  }
}

function param(column: ColumnMeta, index: number, zone: string): string {
  if (column.sqlType === "timestamptz") return `($${index}::timestamp at time zone '${zone}')`;
  if (column.sqlType === "jsonb") return `$${index}::jsonb`;
  return `$${index}::${column.sqlType}`;
}

function value(column: ColumnMeta, raw: unknown): unknown {
  if (raw === undefined || raw === null) return null;
  return column.sqlType === "jsonb" ? JSON.stringify(raw) : raw;
}

const keyOf = (def: TableDef, row: Row) =>
  def.meta.primaryKey.map((k) => String(row[k])).join("\u0000");

function orderOf(def: TableDef, index: number, length: number): number {
  return PREPENDED.has(def.meta.name) ? index - length : index;
}

export interface GasDbStoreOptions {
  timeZone?: string;
}

export function createGasDbStore(
  db: Driver,
  options: GasDbStoreOptions = {},
): GasStore & {
  /** Пустая база: записать исходный набор целиком (сиды демо) */
  seed(snapshot: GasOpsSnapshot): Promise<void>;
} {
  const zone = options.timeZone ?? "Europe/Moscow";
  /** Версия, при которой прочитан снимок: по ней `update` узнаёт устаревшее решение */
  const versions = new WeakMap<GasOpsSnapshot, number>();

  async function load(): Promise<{ rows: GasRows; version: number }> {
    const statements: Statement[] = gasTables.map((def) => ({
      text: `select ${Object.entries(def.columns)
        .map(([key, column]) => selectExpr(key, column, zone))
        .join(
          ", ",
        )} from ${def.meta.name} order by row_order, ${def.meta.primaryKey.map((k) => q(sqlName(k))).join(", ")}`,
    }));
    statements.push({ text: "select version from gas_versions where key = 'main'" });
    const results = await db.batch(statements, { readOnly: true });
    const rows: GasRows = {};
    gasTables.forEach((def, i) => {
      rows[def.meta.name] = results[i] ?? [];
    });
    const version = Number(results[gasTables.length]?.[0]?.["version"] ?? 0);
    return { rows, version };
  }

  function insert(def: TableDef, row: Row, order: number): Statement {
    const entries = Object.entries(def.columns);
    return {
      text: `insert into ${def.meta.name} (${entries.map(([k]) => q(sqlName(k))).join(", ")}, row_order) values (${entries
        .map(([, column], i) => param(column, i + 1, zone))
        .join(", ")}, $${entries.length + 1})`,
      values: [...entries.map(([key, column]) => value(column, row[key])), order],
    };
  }

  function updateRow(def: TableDef, row: Row, order: number): Statement {
    const pk = new Set(def.meta.primaryKey);
    const set = Object.entries(def.columns).filter(([key]) => !pk.has(key));
    const where = def.meta.primaryKey;
    return {
      text: `update ${def.meta.name} set ${set
        .map(([key, column], i) => `${q(sqlName(key))} = ${param(column, i + 1, zone)}`)
        .join(", ")}, row_order = $${set.length + 1} where ${where
        .map((key, i) => `${q(sqlName(key))} = $${set.length + 2 + i}`)
        .join(" and ")}`,
      values: [
        ...set.map(([key, column]) => value(column, row[key])),
        order,
        ...where.map((key) => row[key]),
      ],
    };
  }

  function remove(def: TableDef, row: Row): Statement {
    return {
      text: `delete from ${def.meta.name} where ${def.meta.primaryKey
        .map((key, i) => `${q(sqlName(key))} = $${i + 1}`)
        .join(" and ")}`,
      values: def.meta.primaryKey.map((key) => row[key]),
    };
  }

  /** Разница двух наборов строк: вставки по порядку таблиц, затем правки, удаления в обратном */
  function diff(before: GasRows, after: GasRows): Statement[] {
    const inserts: Statement[] = [];
    const updates: Statement[] = [];
    const deletes: Statement[] = [];
    for (const def of gasTables) {
      const old = new Map(
        (before[def.meta.name] ?? []).map((row, i, all) => [
          keyOf(def, row),
          { row, order: orderOf(def, i, all.length) },
        ]),
      );
      const next = after[def.meta.name] ?? [];
      const seen = new Set<string>();
      next.forEach((row, i) => {
        const key = keyOf(def, row);
        seen.add(key);
        const order = orderOf(def, i, next.length);
        const prev = old.get(key);
        if (!prev) inserts.push(insert(def, row, order));
        else if (prev.order !== order || !sameRow(def, prev.row, row))
          updates.push(updateRow(def, row, order));
      });
      for (const [key, { row }] of old) if (!seen.has(key)) deletes.unshift(remove(def, row));
    }
    return [...inserts, ...updates, ...deletes];
  }

  async function write(statements: Statement[], version: number): Promise<void> {
    // Первый оператор пакета: версия совпала — растёт, не совпала — деление на ноль откатывает всё
    const guard: Statement = {
      text: `with bumped as (update gas_versions set version = version + 1 where key = 'main' and version = $1 returning 1)
             select 1 / (select count(*) from bumped)::int as ok`,
      values: [version],
    };
    try {
      await db.batch([guard, ...statements]);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "22012") {
        throw new GasStaleError();
      }
      throw error;
    }
  }

  return {
    async read() {
      const { rows, version } = await load();
      const snapshot = rowsToSnapshot(rows);
      versions.set(snapshot, version);
      return snapshot;
    },

    async update(change, base) {
      const { rows, version } = await load();
      // Решение принято по другому снимку: запись была бы по устаревшим данным
      if (base && versions.has(base) && versions.get(base) !== version) throw new GasStaleError();
      const next = change(rowsToSnapshot(rows));
      await write(diff(rows, snapshotToRows(next)), version);
      versions.set(next, version + 1);
      return next;
    },

    async seed(snapshot) {
      const { rows, version } = await load();
      await write(diff(rows, snapshotToRows(snapshot)), version);
    },
  };
}

/** jsonb в базе хранит ключи объекта в своём порядке: сравнение без учёта порядка ключей */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Row)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((value as Row)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Строки равны по смыслу: сравнение после того же перевода, что при чтении из базы */
function sameRow(def: TableDef, a: Row, b: Row): boolean {
  return Object.keys(def.columns).every((key) => stable(a[key]) === stable(b[key]));
}
