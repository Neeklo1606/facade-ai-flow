import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ExtractedPosition, Material, MaterialCategory } from "@/contracts";
import {
  SUGGESTION_THRESHOLD,
  categoryFor,
  suggestMaterial,
  suppliersFor,
  topCategory,
} from "@/domain/catalog";
import { queries } from "./queries";

/**
 * Номенклатура и категории для экранов (ADR-014): справочник, дерево и правила домена —
 * предложение материала, категория по наименованию, подбор поставщиков. Экран не считает сам.
 */
export { SUGGESTION_THRESHOLD };

const EMPTY: never[] = [];
// Пустые списки — одни и те же, иначе зависимости useMemo менялись бы каждый рендер
const EMPTY_MATERIALS: Material[] = [];
const EMPTY_CATEGORIES: MaterialCategory[] = [];

export function useCatalog() {
  const materials = useQuery(queries.materials()).data ?? EMPTY_MATERIALS;
  const categories = useQuery(queries.categories()).data ?? EMPTY_CATEGORIES;

  const categoryById = useMemo(
    () => new Map(categories.map((item) => [item.id, item])),
    [categories],
  );
  const pathOf = useCallback(
    (categoryId: string) => {
      const path: MaterialCategory[] = [];
      let current = categoryById.get(categoryId);
      while (current && path.length < 10) {
        path.unshift(current);
        current = current.parentId ? categoryById.get(current.parentId) : undefined;
      }
      return path;
    },
    [categoryById],
  );
  return {
    materials,
    categories,
    categoryById,
    pathOf,
    /** Название категории верхнего уровня — то, чем поставщик объявляет, что поставляет */
    topOf: (categoryId: string) => topCategory(categoryId, categories),
    suggest: (name: string) => suggestMaterial(name, materials),
    categoryFor: (name: string) => categoryFor(name, categories),
  };
}

/**
 * Кому уходит запрос по выбранным позициям (ADR-014, п. 6): категории их материалов
 * против категорий поставщиков, регион объекта — первым
 */
export function useSupplierCandidates(
  positions: Pick<ExtractedPosition, "materialId">[],
  region: string,
  enabled = true,
) {
  const { materials, categories } = useCatalog();
  const suppliers = useQuery({ ...queries.suppliers(), enabled }).data ?? EMPTY;
  return useMemo(() => {
    const needed = new Set<string>();
    for (const position of positions) {
      const material = materials.find((item) => item.id === position.materialId);
      const top = material ? topCategory(material.categoryId, categories) : null;
      if (top) needed.add(top.id);
    }
    const candidates = suppliersFor(
      [...needed],
      region,
      suppliers.map((item) => item.profile),
    );
    return {
      needed: [...needed],
      candidates: candidates.flatMap((candidate) => {
        const item = suppliers.find((s) => s.supplier.id === candidate.supplierId);
        return item ? [{ ...candidate, ...item }] : [];
      }),
    };
  }, [positions, materials, categories, suppliers, region]);
}
