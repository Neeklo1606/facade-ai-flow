import { z } from "zod";
import {
  catalogChanges,
  characteristic,
  materialCategories,
  materialChanges,
  materials,
  type CatalogChange,
  type Material,
  type MaterialCategory,
} from "@/contracts";
import type { Actor } from "./common";

/**
 * Справочник номенклатуры и дерево категорий (ADR-014, п. 4–5). Правка материала пишет
 * `material_changes` в той же транзакции: по строке на изменённое поле.
 */
const id = z.string().min(1);
const textList = z.array(z.string().trim().min(1).max(200)).max(30);

export const categoryList = z.array(materialCategories);

export const materialCard = z.object({
  material: materials,
  category: materialCategories.nullable(),
  /** Путь в дереве: «Подконструкция › Кронштейны» */
  path: z.array(z.string()),
  changes: z.array(materialChanges),
  /** Сколько позиций сопоставлено с материалом и на скольких объектах */
  usage: z.object({ positions: z.number().int(), projects: z.number().int() }),
});

export const saveMaterialInput = z.object({
  /** null — новый материал */
  id: id.nullable(),
  name: z.string().trim().min(3).max(300),
  unit: z.string().trim().min(1).max(20),
  categoryId: id,
  characteristics: z.array(characteristic).max(20),
  synonyms: textList,
  spellings: textList,
});

export type MaterialCard = z.infer<typeof materialCard>;
export type SaveMaterialInput = z.infer<typeof saveMaterialInput>;

/** Категория дерева: создать, переименовать, перенести (ADR-023, п. 2) */
export const saveCategoryInput = z.object({
  /** null — новая категория */
  id: id.nullable(),
  name: z.string().trim().min(2).max(120),
  /** null — верхний уровень */
  parentId: id.nullable(),
  rules: textList,
});

/** Поставщик: без региона и категорий он не попадёт ни в один запрос (ADR-023, п. 1) */
export const saveSupplierInput = z.object({
  id: id.nullable(),
  name: z.string().trim().min(2).max(200),
  inn: z.string().trim().min(10).max(12).nullable(),
  region: z.string().trim().min(2).max(120),
  categories: z.array(id).min(1).max(30),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(32),
  email: z.string().trim().email().max(120),
});

/** Строка загрузки из файла: то, что человек сопоставил с колонками (ADR-023, п. 3) */
export const importMaterialsInput = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().trim().max(300),
        unit: z.string().trim().max(20),
        category: z.string().trim().max(120),
        characteristics: z.string().trim().max(300).optional(),
      }),
    )
    .max(5000),
});

export const importReport = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  /** Непринятые строки: номер в файле и причина — «частично прошло» молча не бывает */
  refused: z.array(z.object({ row: z.number().int(), reason: z.string() })),
});

/** Журнал справочников: кто, когда и что изменил (ADR-023, п. 6) */
export const catalogJournal = z.array(catalogChanges);

export type SaveCategoryInput = z.infer<typeof saveCategoryInput>;
export type SaveSupplierInput = z.infer<typeof saveSupplierInput>;
export type ImportMaterialsInput = z.infer<typeof importMaterialsInput>;
export type ImportReport = z.infer<typeof importReport>;

export interface CatalogPort {
  categories(): Promise<MaterialCategory[]>;
  /** null — материала нет */
  material(materialId: string): Promise<MaterialCard | null>;
  /** Добавить или изменить материал; название с единицей уникальны — иначе ConflictError */
  saveMaterial(input: SaveMaterialInput, actor: Actor): Promise<Material>;
  /** Создать, переименовать или перенести категорию; перенос в своё поддерево — ConflictError */
  saveCategory(input: SaveCategoryInput, actor: Actor): Promise<MaterialCategory>;
  /** Завести или изменить поставщика вместе с профилем подбора */
  saveSupplier(input: SaveSupplierInput, actor: Actor): Promise<{ id: string }>;
  /** Журнал изменений справочников, свежие сверху */
  catalogChanges(limit?: number): Promise<CatalogChange[]>;
  /** Загрузка номенклатуры пачкой: обновляет по «наименование + единица», не удаляет */
  importMaterials(input: ImportMaterialsInput, actor: Actor): Promise<ImportReport>;
}
