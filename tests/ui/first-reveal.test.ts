import { describe, expect, test } from "bun:test";
import {
  COUNT_MS,
  REVEAL_KEY,
  claimFirstReveal,
  countUpValue,
  type RevealStorage,
} from "@/lib/ui/first-reveal";

/** Появление «Монохрома» один раз на сессию (ADR-055, раздел 2.3) */

function store(): RevealStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe("claimFirstReveal", () => {
  test("первый показ да, второй с тем же ключом нет", () => {
    const s = store();
    expect(claimFirstReveal("t-overview", s)).toBe(true);
    expect(claimFirstReveal("t-overview", s)).toBe(false);
    expect(JSON.parse(s.data.get(REVEAL_KEY)!)).toEqual(["t-overview"]);
  });

  test("разные экраны появляются каждый по разу", () => {
    const s = store();
    expect(claimFirstReveal("t-a", s)).toBe(true);
    expect(claimFirstReveal("t-b", s)).toBe(true);
    expect(claimFirstReveal("t-a", s)).toBe(false);
  });

  test("показ, записанный раньше в сессии, не повторяется", () => {
    const s = store();
    s.data.set(REVEAL_KEY, JSON.stringify(["t-saved"]));
    expect(claimFirstReveal("t-saved", s)).toBe(false);
  });

  test("испорченное значение и запрет хранилища не роняют экран", () => {
    const broken = store();
    broken.data.set(REVEAL_KEY, "{не json");
    expect(claimFirstReveal("t-broken", broken)).toBe(true);
    expect(claimFirstReveal("t-broken", broken)).toBe(false);

    const denied: RevealStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(claimFirstReveal("t-denied", denied)).toBe(true);
    expect(claimFirstReveal("t-denied", denied)).toBe(false);
    expect(claimFirstReveal("t-none", null)).toBe(true);
    expect(claimFirstReveal("t-none", null)).toBe(false);
  });
});

describe("countUpValue", () => {
  test("от нуля до итога за 600 мс, без перелёта", () => {
    expect(COUNT_MS).toBe(600);
    expect(countUpValue(1250, 0)).toBe(0);
    expect(countUpValue(1250, COUNT_MS)).toBe(1250);
    expect(countUpValue(1250, COUNT_MS * 2)).toBe(1250);
    let previous = 0;
    for (let t = 0; t <= COUNT_MS; t += 50) {
      const v = countUpValue(1250, t);
      expect(v).toBeGreaterThanOrEqual(previous);
      expect(v).toBeLessThanOrEqual(1250);
      previous = v;
    }
  });

  test("к середине пройдено больше половины: замедление к концу", () => {
    expect(countUpValue(100, COUNT_MS / 2)).toBeGreaterThan(50);
  });
});
