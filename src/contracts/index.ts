/**
 * Контракты предметной области: схемы таблиц PostgreSQL, представления для экранов и словари.
 * Типы выводятся из схем, руками не пишутся. Глоссарий — docs/domain/glossary.md,
 * схема БД — docs/db/schema.md (генерируется из этих файлов).
 */

export * from "./org";
export * from "./projects";
export * from "./documents";
export * from "./positions";
export * from "./procurement";
export * from "./field";
export * from "./timeline";
export { idSchema, timestampSchema, tables, enums, sqlName } from "./db";
export type { TableDef, ColumnMeta, IndexMeta, EnumMeta } from "./db";
