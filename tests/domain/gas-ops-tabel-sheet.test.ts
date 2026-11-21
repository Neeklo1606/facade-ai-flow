import { describe, expect, test } from "bun:test";
import { cellRef, colLetter, keySelection, type Selection } from "@/domain/gas-ops/tabel";

/** Табель как таблица (ADR-081): буквы столбцов, адрес ячейки, клавиши */

const at = (row: number, col: number): Selection => ({
  anchor: { row, col },
  focus: { row, col },
});
const size = { rows: 50, cols: 21 };

describe("буквы и адрес", () => {
  test("буквы столбцов как в таблицах", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(colLetter)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });

  test("адрес: данные с B, строки с 1, диапазон через двоеточие", () => {
    expect(cellRef(at(0, 0))).toBe("B1");
    expect(cellRef(at(6, 2))).toBe("D7");
    expect(cellRef({ anchor: { row: 8, col: 4 }, focus: { row: 6, col: 2 } })).toBe("D7:F9");
  });
});

describe("клавиши", () => {
  test("Home и End по строке, с Ctrl — углы таблицы", () => {
    expect(keySelection("Home", false, false, at(5, 7), size, 10)).toEqual(at(5, 0));
    expect(keySelection("End", false, false, at(5, 7), size, 10)).toEqual(at(5, 20));
    expect(keySelection("Home", true, false, at(5, 7), size, 10)).toEqual(at(0, 0));
    expect(keySelection("End", true, false, at(5, 7), size, 10)).toEqual(at(49, 20));
  });

  test("PageUp и PageDown на экран, не за край", () => {
    expect(keySelection("PageDown", false, false, at(5, 3), size, 10)).toEqual(at(15, 3));
    expect(keySelection("PageDown", false, false, at(45, 3), size, 10)).toEqual(at(49, 3));
    expect(keySelection("PageUp", false, false, at(5, 3), size, 10)).toEqual(at(0, 3));
  });

  test("Shift расширяет выделение от якоря", () => {
    expect(keySelection("End", false, true, at(2, 3), size, 10)).toEqual({
      anchor: { row: 2, col: 3 },
      focus: { row: 2, col: 20 },
    });
  });

  test("Tab вправо, Shift+Tab влево, одна ячейка", () => {
    expect(keySelection("Tab", false, false, at(2, 3), size, 10)).toEqual(at(2, 4));
    expect(keySelection("Tab", false, true, at(2, 3), size, 10)).toEqual(at(2, 2));
    expect(keySelection("Tab", false, true, at(2, 0), size, 10)).toEqual(at(2, 0));
  });

  test("чужая клавиша — null", () => {
    expect(keySelection("x", false, false, at(1, 1), size, 10)).toBeNull();
  });
});
