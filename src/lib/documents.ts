import type { DocumentListItem } from "@/api/types";

/** Основная спецификация объекта — действующая ревизия с наибольшим числом позиций (глоссарий, §3) */
export function mainSpecification(items: DocumentListItem[]) {
  return items.reduce<DocumentListItem | null>(
    (best, item) =>
      item.extracted > 0 && (!best || item.extracted > best.extracted) ? item : best,
    null,
  );
}
