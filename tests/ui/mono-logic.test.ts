import { describe, expect, test } from "bun:test";
import {
  allState,
  chartPoints,
  deltaOf,
  formatHours,
  formatManHours,
  formatRub,
  initialTable,
  sharePercents,
  tableKey,
  toggleAll,
  type TableState,
} from "@/lib/ui/mono-logic";

/** Логика компонентов «Монохрома» (ADR-055, S3) */

const sp = "\u00a0";

describe("форматирование", () => {
  test("деньги: разряды, без копеек, нет значения — прочерк", () => {
    expect(formatRub(1527150)).toBe(`1${sp}527${sp}150${sp}₽`);
    expect(formatRub(19950.4)).toBe(`19${sp}950${sp}₽`);
    expect(formatRub(0)).toBe(`0${sp}₽`);
    expect(formatRub(null)).toBe("—");
    expect(formatRub(Number.NaN)).toBe("—");
  });

  test("часы из минут: до двух знаков без хвостовых нулей", () => {
    expect(formatHours(450)).toBe(`7,5${sp}ч`);
    expect(formatHours(480)).toBe(`8${sp}ч`);
    expect(formatHours(21685)).toBe(`361,42${sp}ч`);
    expect(formatHours(undefined)).toBe("—");
  });

  test("человеко-часы", () => {
    expect(formatManHours(750)).toBe(`12,5${sp}чел.-ч`);
    expect(formatManHours(null)).toBe("—");
  });
});

describe("изменение по смыслу", () => {
  test("рост начислений хорош, рост «ждут решения» плох", () => {
    expect(deltaOf(110, 100)).toMatchObject({ direction: "up", tone: "good", label: `+10${sp}%` });
    expect(deltaOf(110, 100, "down")).toMatchObject({ direction: "up", tone: "bad" });
    expect(deltaOf(90, 100, "down")).toMatchObject({ direction: "down", tone: "good" });
    expect(deltaOf(96, 100)?.label).toBe(`−4${sp}%`);
  });

  test("без изменения — нейтрально", () => {
    expect(deltaOf(100, 100)).toMatchObject({
      direction: "flat",
      tone: "neutral",
      label: `0${sp}%`,
    });
  });

  test("нет прошлого или он ноль — процента нет, а не бесконечность", () => {
    expect(deltaOf(100, null)).toBeNull();
    expect(deltaOf(100, 0)).toBeNull();
    expect(deltaOf(null, 100)).toBeNull();
  });
});

describe("точки графика", () => {
  test("отсутствующие точки не рисуются нулём", () => {
    const points = chartPoints(["Пн", "Вт", "Ср"], [10, undefined, Number.NaN], [8, null]);
    expect(points.map((p) => p.current)).toEqual([10, null, null]);
    expect(points.map((p) => p.previous)).toEqual([8, null, null]);
    expect(points.some((p) => p.current === 0 || p.previous === 0)).toBe(false);
  });

  test("настоящий ноль остаётся нулём", () => {
    expect(chartPoints(["Пн"], [0])[0]!.current).toBe(0);
  });
});

describe("клавиши таблицы", () => {
  const ids = ["a", "b", "c"];
  const press = (state: TableState, ...keys: string[]) =>
    keys.reduce((s, k) => tableKey(s, k, ids), state);

  test("J и K ведут курсор в пределах списка", () => {
    expect(press(initialTable, "j").cursor).toBe(0);
    expect(press(initialTable, "j", "j", "j", "j").cursor).toBe(2);
    expect(press(initialTable, "j", "j", "k", "k", "k").cursor).toBe(0);
    expect(press(initialTable, "k").cursor).toBe(2);
  });

  test("Enter открывает строку, J листает открытую, Esc закрывает", () => {
    const opened = press(initialTable, "j", "Enter");
    expect(opened.open).toBe("a");
    expect(press(opened, "j").open).toBe("b");
    expect(press(opened, "Escape").open).toBeNull();
    // Enter без курсора ничего не открывает
    expect(press(initialTable, "Enter").open).toBeNull();
  });

  test("X отмечает строку для пачки, Esc без панели снимает выбор", () => {
    const picked = press(initialTable, "j", "x", "j", "x");
    expect([...picked.selected]).toEqual(["a", "b"]);
    expect([...press(picked, "k", "x").selected]).toEqual(["b"]);
    expect(press(picked, "Escape").selected.size).toBe(0);
  });

  test("выбрать все и состояние флажка", () => {
    expect(allState(new Set(), ids)).toBe(false);
    expect(allState(new Set(["a"]), ids)).toBe("indeterminate");
    expect(allState(toggleAll(new Set(["a"]), ids), ids)).toBe(true);
    expect(toggleAll(new Set(ids), ids).size).toBe(0);
  });

  test("пустой список не ломается", () => {
    expect(tableKey(initialTable, "j", [])).toBe(initialTable);
  });
});

describe("доли", () => {
  test("целые проценты в сумме ровно 100", () => {
    const p = sharePercents([
      { key: "a", value: 1 },
      { key: "b", value: 1 },
      { key: "c", value: 1 },
    ]);
    expect(Object.values(p).reduce((s, v) => s + v, 0)).toBe(100);
    expect(sharePercents([{ key: "a", value: 0 }])).toEqual({ a: 0 });
  });
});
