import { describe, expect, test } from "bun:test";
import { createElement, Fragment } from "react";
import { hintOf, nodeText } from "@/lib/node-text";

// Подсказка `title` у обрезанной строки списка (обход QA 23.11): полный текст из узла React
describe("nodeText", () => {
  test("строка, число и пустые значения", () => {
    expect(nodeText("Бригада 1")).toBe("Бригада 1");
    expect(nodeText(12)).toBe("12");
    expect(nodeText(null)).toBe("");
    expect(nodeText(false)).toBe("");
  });

  test("элементы и массивы склеиваются, пробелы схлопываются", () => {
    const node = createElement(
      Fragment,
      null,
      "Подтверждена",
      createElement("span", null, " · ОБ-001 "),
      ["  · смета,", " версия 1"],
    );
    expect(nodeText(node)).toBe("Подтверждена · ОБ-001 · смета, версия 1");
  });

  test("hintOf не ставит пустую подсказку", () => {
    expect(hintOf(null)).toBeUndefined();
    expect(hintOf(createElement("span"))).toBeUndefined();
    expect(hintOf("ОБ-102")).toBe("ОБ-102");
  });
});
