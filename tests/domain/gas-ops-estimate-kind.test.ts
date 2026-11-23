import { describe, expect, test } from "bun:test";
import { classifySections, estimateKind, sectionRole } from "@/domain/gas-ops/estimate-kind";

/** Названия разделов как в сметах заказчика (без сумм и адресов) */
describe("роль раздела", () => {
  test("сталь, испытания, другие работы, не работы бригад", () => {
    expect(sectionRole("Раздел 1 Монтаж стальных газопроводов")).toBe("steel");
    expect(sectionRole("Раздел 1 Сталь")).toBe("steel");
    expect(sectionRole("Раздел 2 Испытания газопроводов")).toBe("pressure");
    expect(sectionRole("Опрессовка")).toBe("pressure");
    expect(sectionRole("Раздел 1 Земляные работы")).toBe("other-work");
    expect(sectionRole("Раздел 2 Монтаж подземного полиэтиленового газопровода")).toBe(
      "other-work",
    );
    expect(sectionRole("Раздел 7 Субподрядные работы")).toBe("not-work");
    expect(sectionRole("Раздел 9 Корректировки для загрузки")).toBe("not-work");
    expect(sectionRole("Раздел 3")).toBe("not-work");
    expect(sectionRole("Сталепромышленный комплекс")).toBe("other-work");
  });
});

describe("тип сметы", () => {
  test("только сталь", () => {
    expect(
      estimateKind(["Раздел 3 Монтаж стальных газопроводов", "Раздел 7 Субподрядные работы"]),
    ).toBe("steel");
  });

  test("сталь и испытания: оба в отчёт", () => {
    const r = classifySections([
      { key: "n1", title: "Раздел 1 Монтаж стальных газопроводов" },
      { key: "n2", title: "Раздел 2 Испытания газопроводов" },
    ]);
    expect(r.kind).toBe("steel-pressure");
    expect(r.sections.map((s) => s.report)).toEqual([true, true]);
  });

  test("подземный: в отчёт только сталь, испытания — уточнить", () => {
    const r = classifySections([
      { key: "n1", title: "Раздел 1 Земляные работы" },
      { key: "n2", title: "Раздел 2 Монтаж подземного полиэтиленового газопровода" },
      { key: "n3", title: "Раздел 3 Монтаж стальных газопроводов" },
      { key: "n4", title: "Раздел 4 Испытания газопроводов" },
      { key: "n5", title: "Раздел 5 Субподрядные работы" },
    ]);
    expect(r.kind).toBe("underground");
    expect(r.sections.map((s) => s.report)).toEqual([false, false, true, false, false]);
    expect(r.sections[3]?.note).toContain("уточнить");
  });

  test("без стали — тип не определён, ничего не угадываем", () => {
    expect(estimateKind(["Раздел 1 Земляные работы"])).toBe("unknown");
  });
});
