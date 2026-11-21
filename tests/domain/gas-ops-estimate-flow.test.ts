import { describe, expect, test } from "bun:test";
import { intakeChecks, objectPath, sectionsWord } from "@/domain/gas-ops/estimate-flow";

/** Путь «смета → табель» (ADR-080): итоги разбора и полоса пути объекта */

const full = { materialsKopecks: 100, laborHours: 10 };

describe("итоги разбора", () => {
  test("полный файл: все шаги зелёные, объект найден по номеру", () => {
    const checks = intakeChecks({
      headerFound: 6,
      headerTotal: 6,
      sections: [full, full, full],
      convergence: { ok: true, diffKopecks: 0 },
      match: { kind: "attach", objectId: "o1", by: "number" },
      matchedLabel: "3-417",
    });
    expect(checks.map((c) => c.tone)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(checks[1]!.text).toBe("3 раздела, сумма сходится с итогом без НДС");
    expect(checks[4]!.text).toBe("найден 3-417 по номеру сметы");
  });

  test("неполный файл: расхождение, нет материалов и норматива, похожий объект", () => {
    const checks = intakeChecks({
      headerFound: 4,
      headerTotal: 6,
      sections: [full, { materialsKopecks: null, laborHours: null }],
      convergence: { ok: false, diffKopecks: -150_000 },
      match: { kind: "maybe", objectId: "o1", score: 0.7 },
      matchedLabel: "3-417",
    });
    expect(checks.every((c) => c.tone === "warn")).toBe(true);
    expect(checks[0]!.text).toBe("найдено 4 из 6 полей");
    expect(checks[1]!.text).toContain("расходится с итогом на 1");
    expect(checks[2]!.text).toBe("отделены в 1 из 2 разделов");
    expect(checks[3]!.text).toContain("остальные начисляются вручную");
  });

  test("новый объект и пустой файл", () => {
    const checks = intakeChecks({
      headerFound: 0,
      headerTotal: 6,
      sections: [],
      convergence: { ok: true, diffKopecks: 0 },
      match: { kind: "new" },
      matchedLabel: null,
    });
    expect(checks[1]!.text).toBe("разделов не нашли");
    expect(checks[1]!.tone).toBe("warn");
    expect(checks[4]!.text).toBe("в справочнике нет: создадим новый");
  });

  test("форма слова «раздел»", () => {
    expect([1, 2, 5, 11, 21, 22, 25].map(sectionsWord)).toEqual([
      "раздел",
      "раздела",
      "разделов",
      "разделов",
      "раздел",
      "раздела",
      "разделов",
    ]);
  });
});

describe("полоса пути объекта", () => {
  const base = {
    sections: 0,
    costConfirmed: false,
    assigned: 0,
    entries: 0,
    confirmedEntries: 0,
    accruedRub: 0,
  };
  const states = (input: typeof base) => objectPath(input).map((s) => s.state);

  test("без сметы текущий шаг — смета", () => {
    expect(states(base)).toEqual(["current", "todo", "todo", "todo", "todo"]);
  });

  test("смета есть, стоимость не подтверждена", () => {
    expect(states({ ...base, sections: 4 })).toEqual(["done", "current", "todo", "todo", "todo"]);
  });

  test("бригады назначены не на все разделы", () => {
    const steps = objectPath({ ...base, sections: 4, costConfirmed: true, assigned: 2 });
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo"]);
    expect(steps[2]!.hint).toBe("назначено 2 из 4");
  });

  test("весь путь пройден", () => {
    expect(
      states({
        sections: 2,
        costConfirmed: true,
        assigned: 2,
        entries: 5,
        confirmedEntries: 3,
        accruedRub: 1000,
      }),
    ).toEqual(["done", "done", "done", "done", "done"]);
  });
});
