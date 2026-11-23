import { describe, expect, test } from "bun:test";
import {
  classifySections,
  estimateKind,
  pressureSeparate,
  recommendedBrigade,
  sectionRole,
} from "@/domain/gas-ops/estimate-kind";

/** Названия разделов и виды работ как в сметах заказчика (без сумм и адресов) */
describe("роль раздела", () => {
  test("сталь, испытания, земля и П/Э, не работы бригад", () => {
    expect(sectionRole("Раздел 1 Монтаж стальных газопроводов")).toBe("steel");
    expect(sectionRole("Раздел 1 Сталь")).toBe("steel");
    expect(sectionRole("Раздел 2 Испытания газопроводов", true)).toBe("pressure");
    expect(sectionRole("Раздел 2 Испытания газопроводов")).toBe("pressure-in-steel");
    expect(sectionRole("Опрессовка", true)).toBe("pressure");
    expect(sectionRole("Раздел 1 Земляные работы")).toBe("earth-pe");
    expect(sectionRole("Раздел 2 Монтаж подземного полиэтиленового газопровода")).toBe("earth-pe");
    expect(sectionRole("Раздел 7 Субподрядные работы")).toBe("not-work");
    expect(sectionRole("Раздел 9 Корректировки для загрузки")).toBe("not-work");
    expect(sectionRole("Раздел 3")).toBe("not-work");
    expect(sectionRole("Сталепромышленный комплекс")).toBe("other-work");
  });
});

describe("опрессовка отдельным разделом: ответ заказчика 24.11.2026", () => {
  test("вынос, нежилые помещения, газ-ввод, арка — отдельно", () => {
    expect(pressureSeparate("Вынос газопровода низкого давления")).toBe(true);
    expect(pressureSeparate("Газификация нежилых помещений")).toBe(true);
    expect(pressureSeparate("Строительство газопровода-ввода низкого давления")).toBe(true);
    expect(pressureSeparate("Газ-ввод")).toBe(true);
    expect(pressureSeparate("Устройство арки на распределительном газопроводе н.д")).toBe(true);
  });

  test("простая смета: опрессовка входит в сталь", () => {
    expect(pressureSeparate("Новая газификация домовладения")).toBe(false);
    expect(pressureSeparate("Перемонтаж дворового газопровода")).toBe(false);
    expect(pressureSeparate(null)).toBe(false);
  });
});

describe("тип сметы", () => {
  test("только сталь", () => {
    expect(
      estimateKind(["Раздел 3 Монтаж стальных газопроводов", "Раздел 7 Субподрядные работы"]),
    ).toBe("steel");
  });

  test("арка: сталь и испытания отдельными разделами отчёта", () => {
    const r = classifySections(
      [
        { key: "n1", title: "Раздел 1 Сталь" },
        { key: "n2", title: "Раздел 2 Испытания" },
        { key: "n3", title: "Раздел 3" },
      ],
      "Устройство арки на распределительном газопроводе н.д",
    );
    expect(r.kind).toBe("steel-pressure");
    expect(r.sections.map((s) => s.role)).toEqual(["steel", "pressure", "not-work"]);
    expect(r.sections.map((s) => s.report)).toEqual([true, true, false]);
  });

  test("газ-ввод подземный: сталь, земля, П/Э и испытания в отчёт", () => {
    const r = classifySections(
      [
        { key: "n1", title: "Раздел 1 Земляные работы" },
        { key: "n2", title: "Раздел 2 Монтаж подземного полиэтиленового газопровода" },
        { key: "n3", title: "Раздел 3 Монтаж стальных газопроводов" },
        { key: "n4", title: "Раздел 4 Испытания газопроводов" },
        { key: "n5", title: "Раздел 5 Субподрядные работы" },
      ],
      "Строительство газопровода-ввода низкого давления до границы земельного участка",
    );
    expect(r.kind).toBe("underground");
    expect(r.separatePressure).toBe(true);
    expect(r.sections.map((s) => s.report)).toEqual([true, true, true, true, false]);
    expect(r.hint).toContain("бригады № 2 и № 5");
  });

  test("без стали — тип не определён, ничего не угадываем", () => {
    expect(estimateKind(["Раздел 1 Земляные работы"])).toBe("unknown");
  });
});

describe("земля и П/Э — бригады № 2 и № 5", () => {
  test("по номеру в коде или названии", () => {
    expect(recommendedBrigade("earth-pe", { name: "Бригада 2", code: "Б-2" })).toBe(true);
    expect(recommendedBrigade("earth-pe", { name: "Бригада №5", code: "Б-5" })).toBe(true);
    expect(recommendedBrigade("earth-pe", { name: "Бригада 1", code: "Б-1" })).toBe(false);
    expect(recommendedBrigade("earth-pe", { name: "Бригада 12", code: "Б-12" })).toBe(false);
    expect(recommendedBrigade("steel", { name: "Бригада 2", code: "Б-2" })).toBe(false);
  });
});
