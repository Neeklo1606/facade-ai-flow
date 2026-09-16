import { z } from "zod";

/**
 * Описание таблиц PostgreSQL рядом со схемами zod.
 *
 * Схема таблицы — одновременно тип строки (`z.infer`) и задание на схему БД: у каждой колонки
 * есть SQL-тип, у ссылок — внешний ключ с поведением при удалении, у таблицы — индексы и уникальности.
 * `docs/db/schema.md` генерируется из этого описания (`bun run db:schema`), фикстуры проверяются
 * по нему же (`bun run check:fixtures`), поэтому документ, код и данные не расходятся.
 */

export type OnDelete = "restrict" | "cascade" | "set null";

export interface ColumnMeta {
  sqlType: string;
  nullable: boolean;
  primaryKey?: boolean;
  default?: string;
  references?: { table: string; onDelete: OnDelete };
  enumName?: string;
  comment?: string;
}

export interface IndexMeta {
  columns: string[];
  /** Какой список на экране обслуживает индекс */
  purpose: string;
  unique?: boolean;
  where?: string;
  method?: "btree" | "gin";
}

export interface TableMeta {
  name: string;
  comment: string;
  primaryKey: string[];
  indexes: IndexMeta[];
  checks?: string[];
  /** Журнал: строки только добавляются, `update` и `delete` запрещены правами */
  appendOnly?: boolean;
  /** Служебные колонки `created_at`, `updated_at`, `created_by` — есть в БД, не отдаются в API */
  audited?: boolean;
}

export interface EnumMeta {
  name: string;
  values: readonly string[];
  comment: string;
  /** Разрешённые переходы статуса; нет — значения не образуют жизненный цикл */
  transitions?: Record<string, readonly string[]>;
}

export interface TableDef {
  meta: TableMeta;
  schema: z.AnyZodObject;
  columns: Record<string, ColumnMeta>;
}

const columnMeta = new WeakMap<z.ZodTypeAny, ColumnMeta>();

export const tables: TableDef[] = [];
export const enums: EnumMeta[] = [];

interface ColumnOptions {
  nullable?: boolean;
  comment?: string;
  default?: string;
}

type Col<T extends z.ZodTypeAny, O> = O extends { nullable: true } ? z.ZodNullable<T> : T;

function column<T extends z.ZodTypeAny, const O extends ColumnOptions>(
  schema: T,
  meta: Omit<ColumnMeta, "nullable">,
  options?: O,
): Col<T, O> {
  const final = options?.nullable ? schema.nullable() : schema;
  columnMeta.set(final, {
    ...meta,
    nullable: Boolean(options?.nullable),
    ...(options?.comment ? { comment: options.comment } : {}),
    ...(options?.default ? { default: options.default } : {}),
  });
  return final as Col<T, O>;
}

/* ---------- Колонки ---------- */

/**
 * Идентификатор. В БД — `uuid`; фикстуры используют читаемые ключи (`p-korona`),
 * поэтому в схеме это непустая строка, а не проверка формата uuid.
 */
export const idSchema = z.string().min(1);

const localTimestamp = () => z.string().datetime({ local: true, offset: true });

export const col = {
  id: () =>
    column(z.string().min(1), { sqlType: "uuid", primaryKey: true, default: "gen_random_uuid()" }),

  ref: <const O extends ColumnOptions = ColumnOptions>(
    table: string,
    onDelete: OnDelete,
    options?: O,
  ) => column(z.string().min(1), { sqlType: "uuid", references: { table, onDelete } }, options),

  text: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.string(), { sqlType: "text" }, options),

  /** Непустая строка: названия, номера */
  name: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.string().min(1), { sqlType: "text" }, options),

  int: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.number().int(), { sqlType: "integer" }, options),

  smallint: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.number().int(), { sqlType: "smallint" }, options),

  /** Деньги в копейках */
  money: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.number().int(), { sqlType: "bigint", comment: "копейки" }, options),

  /** Количество в натуральных единицах */
  qty: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.number().nonnegative(), { sqlType: "numeric(14,3)" }, options),

  /** Доля 0…1: уверенность распознавания, координаты на листе */
  ratio: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.number().min(0).max(1), { sqlType: "numeric(5,4)" }, options),

  /** Проценты с двумя знаками: удержание, разница в цене */
  percent: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.number(), { sqlType: "numeric(5,2)" }, options),

  /** Число с фиксированной точностью: рейтинг, средние значения */
  numeric: <const O extends ColumnOptions = ColumnOptions>(
    sqlType: `numeric(${number},${number})`,
    options?: O,
  ) => column(z.number(), { sqlType }, options),

  bool: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.boolean(), { sqlType: "boolean" }, options),

  /** Момент времени. Фикстуры хранят локальное время без пояса, в БД — `timestamptz` */
  timestamp: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(localTimestamp(), { sqlType: "timestamptz" }, options),

  date: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.string().date(), { sqlType: "date" }, options),

  textArray: <const O extends ColumnOptions = ColumnOptions>(options?: O) =>
    column(z.array(z.string().min(1)), { sqlType: "text[]" }, options),

  jsonb: <T extends z.ZodTypeAny, const O extends ColumnOptions = ColumnOptions>(
    schema: T,
    options?: O,
  ) => column(schema, { sqlType: "jsonb" }, options),

  enum: <V extends [string, ...string[]], const O extends ColumnOptions = ColumnOptions>(
    def: PgEnum<V>,
    options?: O,
  ) => column(def.schema, { sqlType: def.name, enumName: def.name }, options),
};

/** Время без проверки колонки — для представлений, которые собираются из таблиц */
export const timestampSchema = localTimestamp();

/* ---------- Перечисления и таблицы ---------- */

export interface PgEnum<V extends [string, ...string[]]> {
  name: string;
  values: V;
  schema: z.ZodEnum<V>;
}

export function pgEnum<const V extends [string, ...string[]]>(
  name: string,
  values: V,
  comment: string,
  transitions?: { [K in V[number]]?: readonly V[number][] },
): PgEnum<V> {
  enums.push({
    name,
    values,
    comment,
    ...(transitions ? { transitions: transitions as Record<string, readonly string[]> } : {}),
  });
  return { name, values, schema: z.enum(values) };
}

export function table<S extends z.ZodRawShape>(meta: TableMeta, shape: S) {
  const schema = z.object(shape).strict();
  const columns: Record<string, ColumnMeta> = {};
  for (const [key, value] of Object.entries(shape)) {
    const found = columnMeta.get(value);
    if (!found) throw new Error(`Колонка ${meta.name}.${key} описана без col.*`);
    columns[key] = found;
  }
  for (const key of [...meta.primaryKey, ...meta.indexes.flatMap((index) => index.columns)]) {
    const name = key.replace(/ (asc|desc)$/, "");
    if (!(name in shape))
      throw new Error(`Индекс ${meta.name} ссылается на неизвестную колонку ${name}`);
  }
  tables.push({ meta, schema, columns });
  return schema;
}

/** camelCase → snake_case для имён колонок в БД */
export function sqlName(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
