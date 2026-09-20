import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { UUID, createKeyCodec, keyUuid } from "@/adapters/db/codec";
import { assignOrder } from "@/adapters/db/store";

/** Кодек ключей и порядок строк адаптера PostgreSQL — ADR-005, пп. 4 и 8 */

describe("keyUuid", () => {
  test("SHA-1 без зависимостей совпадает с node:crypto — и на кириллице, и на длинной строке", () => {
    for (const key of ["p-korona", "", "з".repeat(100), "a".repeat(55), "a".repeat(64)]) {
      const hex = createHash("sha1").update(key).digest("hex");
      const expected = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      expect(keyUuid(key)).toBe(expected);
    }
  });

  test("результат — uuid версии 5", () => {
    expect(keyUuid("p-korona")).toMatch(UUID);
    expect(keyUuid("p-korona")[14]).toBe("5");
  });
});

describe("createKeyCodec", () => {
  const codec = createKeyCodec(["p-korona", "e-sokolov"]);

  test("известный ключ туда и обратно", () => {
    expect(codec.decode(codec.encode("p-korona"))).toBe("p-korona");
  });

  test("uuid новой записи проходит как есть", () => {
    const id = "0b6f3a4e-9d61-4c4b-8f0e-2a1d6c7e8f90";
    expect(codec.encode(id)).toBe(id);
    expect(codec.decode(id)).toBe(id);
  });

  test("незнакомый читаемый ключ из адреса даёт uuid, которого нет в базе, а не ошибку", () => {
    expect(codec.encode("p-nowhere")).toMatch(UUID);
    expect(codec.decode(codec.encode("p-nowhere"))).toBe(codec.encode("p-nowhere"));
  });
});

describe("assignOrder", () => {
  const previous = new Map([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);

  test("старые строки сохраняют порядок, новая в середине встаёт между соседями", () => {
    expect(assignOrder(["a", "x", "b", "c"], previous)).toEqual([1, 1.5, 2, 3]);
  });

  test("новые в начале — перед первой, в конце — после последней", () => {
    expect(assignOrder(["x", "y", "a", "b", "c", "z"], previous)).toEqual([-1, 0, 1, 2, 3, 4]);
  });

  test("переставленные старые строки — таблица нумеруется заново", () => {
    expect(assignOrder(["b", "a", "c"], previous)).toEqual([1, 2, 3]);
  });

  test("места между соседями нет — таблица нумеруется заново", () => {
    const tight = new Map([
      ["a", 1],
      ["b", 1 + 1e-12],
    ]);
    expect(assignOrder(["a", "x", "b"], tight)).toEqual([1, 2, 3]);
  });

  test("пустая таблица — по порядку с единицы", () => {
    expect(assignOrder(["a", "b"], new Map())).toEqual([1, 2]);
  });
});
