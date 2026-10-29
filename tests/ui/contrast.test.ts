import { describe, expect, test } from "bun:test";
import { CONTRAST_PAIRS, over, pairRatio, parseColor, ratio } from "@/lib/ui/contrast";

/** Расчёт контраста, общий для check-contrast и витрины (ADR-055) */

describe("parseColor", () => {
  test("полная и короткая запись дают один цвет", () => {
    expect(parseColor("#ffffff")).toEqual([255, 255, 255, 1]);
    expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
    expect(parseColor("#11111380")).toEqual([17, 17, 19, 128 / 255]);
    expect(parseColor("#0008")).toEqual([0, 0, 0, 136 / 255]);
    expect(parseColor("rgba(17, 17, 19, 0.5)")).toEqual([17, 17, 19, 0.5]);
    expect(parseColor("rgb(17 17 19 / 50%)")).toEqual([17, 17, 19, 0.5]);
  });

  test("не цвет — null", () => {
    expect(parseColor("var(--ink)")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("ratio", () => {
  test("чёрный на белом 21:1, одинаковые 1:1", () => {
    expect(ratio([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 5);
    expect(ratio([85, 85, 92, 1], [85, 85, 92, 1])).toBeCloseTo(1, 5);
  });

  test("полупрозрачный ложится на поверхность", () => {
    expect(over([0, 0, 0, 0.5], [255, 255, 255, 1])).toEqual([127.5, 127.5, 127.5, 1]);
  });

  test("пара с плашкой считается поверх своей поверхности", () => {
    const colors: Record<string, [number, number, number, number]> = {
      up: [24, 118, 64, 1],
      "up-bg": [230, 245, 236, 1],
      card: [255, 255, 255, 1],
    };
    const pair = CONTRAST_PAIRS.find((p) => p.fg === "up" && p.bg === "up-bg/card")!;
    expect(pairRatio(pair, (n) => colors[n]!)).toBeGreaterThanOrEqual(4.5);
  });
});
