import { z } from "zod";
import {
  characteristic,
  materialCategories,
  materialChanges,
  materials,
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

export interface CatalogPort {
  categories(): Promise<MaterialCategory[]>;
  /** null — материала нет */
  material(materialId: string): Promise<MaterialCard | null>;
  /** Добавить или изменить материал; название с единицей уникальны — иначе ConflictError */
  saveMaterial(input: SaveMaterialInput, actor: Actor): Promise<Material>;
}
