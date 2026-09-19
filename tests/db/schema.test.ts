import { describe, expect, test } from "bun:test";
import { tables } from "@/contracts";

/**
 * Схема из контрактов (ADR-005, п. 2): у каждого внешнего ключа есть индекс, где он первый
 * столбец, — иначе удаление и выборки по связи идут полным просмотром.
 */
const leading = (column: string) => column.split(" ")[0]!;

describe("индексы схемы", () => {
  for (const def of tables) {
    const refs = Object.entries(def.columns).filter(([, column]) => column.references);
    if (!refs.length) continue;
    test(`${def.meta.name}: внешние ключи с индексом`, () => {
      const firsts = new Set([
        ...(def.meta.indexes ?? []).map((index) => leading(index.columns[0]!)),
        def.meta.primaryKey[0]!,
      ]);
      const missing = refs.map(([key]) => key).filter((key) => !firsts.has(key));
      expect(missing).toEqual([]);
    });
  }
});
