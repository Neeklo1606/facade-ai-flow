/**
 * Контракты предметной области: схемы таблиц PostgreSQL, представления для экранов и словари.
 * Типы выводятся из схем, руками не пишутся. Глоссарий — docs/domain/glossary.md,
 * схема БД — docs/db/schema.md (генерируется из этих файлов).
 */

import * as org from "./org";
import * as projects from "./projects";
import * as documents from "./documents";
import * as positions from "./positions";
import * as procurement from "./procurement";
import * as field from "./field";
import * as timeline from "./timeline";
import {
  enums as registeredEnums,
  tables as registeredTables,
  type EnumMeta,
  type TableDef,
} from "./db";

export * from "./org";
export * from "./projects";
export * from "./documents";
export * from "./positions";
export * from "./procurement";
export * from "./field";
export * from "./timeline";
export { idSchema, timestampSchema, sqlName } from "./db";
export type { TableDef, ColumnMeta, IndexMeta, EnumMeta } from "./db";

/*
 * Реестр таблиц и перечислений собирается из модулей живым кодом, а не побочным эффектом
 * их импорта. При `"sideEffects": false` сборщик выбрасывал модули контрактов, нужные только
 * типам, и в собранном сервере реестр приходил пустым: мост адаптера PostgreSQL строил
 * состояние из нуля таблиц и падал на первом же чтении. В демо-контуре этого не было видно —
 * там те же модули держат фикстуры.
 */
const modules = [org, projects, documents, positions, procurement, field, timeline];

/*
 * Описания таблиц складывает `table()` при выполнении модуля, а список здесь отбирается
 * по тем схемам, которые модули действительно экспортируют. Смысл не в фильтрации: это
 * единственная ссылка на модули живым кодом. Без неё при `"sideEffects": false` сборщик
 * выбрасывал модули, нужные только типам, регистрация не выполнялась, и в собранном сервере
 * реестр приходил пустым — мост адаптера PostgreSQL строил состояние из нуля таблиц и падал
 * на первом чтении. В демо-контуре этого не было видно: там те же модули держат фикстуры.
 */
const exported = new Set<unknown>(modules.flatMap((module) => Object.values(module)));

export const tables: TableDef[] = registeredTables.filter((def) => exported.has(def.schema));

/** Перечисления регистрируются теми же модулями: список берётся после их выполнения */
export const enums: EnumMeta[] = registeredEnums;
