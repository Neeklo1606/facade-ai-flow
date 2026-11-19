import { describe, expect, test } from "bun:test";
import { parseEstimateGrid } from "@/domain/gas-ops/estimate-parse";
import { addressKey, parseAddress, parseEstimateHeader } from "@/domain/gas-ops/estimate-header";
import {
  changedPhrase,
  changedSections,
  convergence,
  fileStatusOf,
  matchObject,
  objectDraft,
  objectTaken,
  outcomeText,
  sectionView,
} from "@/domain/gas-ops/estimate-intake";
import type { EstimateSection, Grid } from "@/domain/gas-ops/estimate-labels";

/** Ресурсная смета в миниатюре: шапка КП, раздел с испытанием внутри, раздел без материалов */
function kp({
  section3 = "1000,00",
  withoutVat = "1500,00",
}: { section3?: string; withoutVat?: string } = {}): Grid {
  return [
    [],
    [null, null, null, null, null, "77-Т-26-СМР"],
    [null, null, null, null, null, "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ"],
    [null, null, null, null, null, "От __05___ _____03_____ 2026"],
    [null, null, null, "Ремонт газопровода по ул. Лесная, 12, кв. 4 в г. Тестовске"],
    [null, null, null, null, null, "(наименование работ и затрат, наименование объекта)"],
    [
      "№ пп",
      "Обоснование",
      "Наименование",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "Т/з осн. раб.",
    ],
    [null, null, null, null, null, null, null, "общая", "В том числе"],
    [null, null, null, null, null, null, null, null, "Осн.З/п", "Эк.Маш.", "З/пМех", "Мат"],
    ["Раздел 3. Монтаж"],
    [
      "'1",
      "ГЭСН16-02-003-02",
      "Прокладка трубопроводов",
      null,
      null,
      null,
      null,
      "300,00",
      "100,00",
      null,
      null,
      "200,00",
      "1",
    ],
    [
      "'2",
      "ГЭСН19-01-015-01",
      "Пневматическое испытание газопроводов",
      null,
      null,
      null,
      null,
      "50,00",
      "40,00",
      null,
      null,
      "10,00",
      "0,2",
    ],
    [
      "Итого прямые затраты по разделу в текущих ценах",
      null,
      null,
      null,
      null,
      null,
      null,
      "350,00",
      "140,00",
      null,
      null,
      "210,00",
      "1,2",
    ],
    ["Итоги по разделу 3 Монтаж :"],
    [" Итого", null, null, null, null, null, null, section3, null, null, null, null, "1,2"],
    [" Материалы", null, null, null, null, null, null, "210,00"],
    [" ФОТ", null, null, null, null, null, null, "140,00"],
    [" Накладные расходы", null, null, null, null, null, null, "420,00"],
    [" Сметная прибыль", null, null, null, null, null, null, "230,00"],
    [
      " Итого по разделу 3 Монтаж",
      null,
      null,
      null,
      null,
      null,
      null,
      section3,
      null,
      null,
      null,
      null,
      "1,2",
    ],
    ["Раздел 7. Документация"],
    [
      "Итого прямые затраты по разделу в текущих ценах",
      null,
      null,
      null,
      null,
      null,
      null,
      "200,00",
      "200,00",
    ],
    ["Итоги по разделу 7 Документация :"],
    [" Итого", null, null, null, null, null, null, "500,00"],
    [" ФОТ", null, null, null, null, null, null, "200,00"],
    [" Итого по разделу 7 Документация", null, null, null, null, null, null, "500,00"],
    ["ИТОГИ ПО СМЕТЕ:"],
    ["Итого прямые затраты по смете в текущих ценах", null, null, null, null, null, null, "550,00"],
    ["Итоги по смете:"],
    [" Итого", null, null, null, null, null, null, withoutVat],
    [" Материалы", null, null, null, null, null, null, "210,00"],
    [" ФОТ", null, null, null, null, null, null, "340,00"],
    [" НДС 5%", null, null, null, null, null, null, "75,00"],
    [" ВСЕГО по смете", null, null, null, null, null, null, "1575,00"],
  ];
}

describe("шапка сметы (ADR-077)", () => {
  test("КП: наименование, адрес, номер и дата со строками файла", () => {
    const h = parseEstimateHeader(kp(), "resource");
    expect(h.object).toEqual({
      value: "Ремонт газопровода по ул. Лесная, 12, кв. 4 в г. Тестовске",
      row: 5,
      confidence: "high",
    });
    expect(h.number.value).toBe("77-Т-26-СМР");
    expect(h.number.row).toBe(2);
    expect(h.date.value).toBe("2026-03-05");
    expect(h.address.value).toEqual({
      settlement: "г. Тестовске",
      street: "ул. Лесная",
      house: "12",
      apartment: "4",
    });
    expect(h.workKind.value).toBe("Ремонт газопровода");
  });

  test("нет шапки: поля пустые с причиной, без догадок", () => {
    const h = parseEstimateHeader([["Раздел 1. Монтаж"]], "resource");
    expect(h.object.value).toBeNull();
    expect(h.number.value).toBeNull();
    expect("reason" in h.number && h.number.reason.length > 0).toBe(true);
    expect(h.address.value).toBeNull();
  });

  test("предлог «в» не прилипает к дому, литера дома остаётся", () => {
    expect(parseAddress("по ул. Садовая, 231 в г. Тестовске")?.house).toBe("231");
    expect(parseAddress("по ул. Садовая, 24 В в г. Тестовске")?.house).toBe("24 В");
    expect(parseAddress("по ул. Садовая, 24а")?.house).toBe("24а");
  });

  test("ключ адреса не зависит от падежа и сокращений", () => {
    const a = parseAddress("по ул. Ореховой, д. 6 в х. Примерном")!;
    const b = parseAddress("х. Примерный, ул. Ореховая, 6")!;
    expect(addressKey(a)).toBe(addressKey(b));
  });
});

describe("разделы и опрессовка (ADR-077)", () => {
  test("работы раздела = итог минус материалы, раздел без материалов — ноль с пояснением", () => {
    const parsed = parseEstimateGrid(kp());
    const [s3, s7] = parsed.sections.map((s) => sectionView(s));
    expect(s3!.totalKopecks).toBe(100000);
    expect(s3!.materialsKopecks).toBe(21000);
    expect(s3!.workKopecks).toBe(79000);
    expect(s3!.laborHours).toBe(1.2);
    expect(s7!.materialsKopecks).toBe(0);
    expect(s7!.materialsNote).toContain("материалов в разделе нет");
  });

  test("опрессовка строкой: прямые плюс НР и СП по доле ФОТ, либо по доле прямых", () => {
    const section = parseEstimateGrid(kp()).sections[0]!;
    // ФОТ строки 40 из 140: (420 + 230) × 40/140 = 185,71; плюс прямые 50 = 235,71
    const byPay = sectionView(section, "payroll").pressure!;
    expect(byPay.totalKopecks).toBe(23571);
    expect(byPay.materialsKopecks).toBe(1000);
    expect(byPay.workKopecks).toBe(22571);
    expect(byPay.needsConfirm).toBe(true);
    // Прямые 50 из 350: 650 × 50/350 = 92,86; плюс 50 = 142,86
    expect(sectionView(section, "direct").pressure!.totalKopecks).toBe(14286);
  });

  test("раздел «Испытания» целиком — опрессовка, СМР раздела ноль", () => {
    const grid = kp().map((row) =>
      row.map((c) => (typeof c === "string" ? c.replace(/Монтаж/g, "Испытания") : c)),
    );
    const v = sectionView(parseEstimateGrid(grid).sections[0]!);
    expect(v.pressure?.kind).toBe("section");
    expect(v.pressure?.workKopecks).toBe(v.workKopecks!);
    expect(v.smrKopecks).toBe(0);
  });
});

describe("кривые файлы (ADR-077)", () => {
  test("пустой лист: «Не распознана» с причиной", () => {
    const status = fileStatusOf(parseEstimateGrid([[], [null, ""]]));
    expect(status.status).toBe("unreadable");
    expect(status.reason).toBeTruthy();
  });

  test("нет итогов: «Нужна проверка»", () => {
    const grid = kp().slice(0, 26);
    const status = fileStatusOf(parseEstimateGrid(grid));
    expect(status.status).toBe("needs-review");
    expect(status.reason).toContain("итог");
  });

  test("сумма разделов не сходится: разница показана", () => {
    const parsed = parseEstimateGrid(kp({ withoutVat: "1600,00" }));
    const c = convergence(parsed);
    expect(c.ok).toBe(false);
    expect(c.diffKopecks).toBe(-10000);
    expect(fileStatusOf(parsed).status).toBe("needs-review");
  });
});

describe("объект без дублей (ADR-077)", () => {
  const header = parseEstimateHeader(kp(), "resource");
  const objects = [
    { id: "o1", label: "Склад", code: "ОБ-1" },
    { id: "o2", label: "ул. Лесная, 12", code: "ОБ-2" },
  ];

  test("номер сметы совпал — «Прикрепить»", () => {
    const withNumber = [
      ...objects,
      { id: "o3", label: "x", code: "ОБ-3", estimateNumber: "77 т 26 смр" },
    ];
    expect(matchObject(header, withNumber)).toEqual({
      kind: "attach",
      objectId: "o3",
      by: "number",
    });
  });

  test("адрес совпал до квартиры — «Прикрепить»", () => {
    const withAddress = [
      ...objects,
      {
        id: "o4",
        label: "y",
        code: "ОБ-4",
        address: parseAddress("г. Тестовск, ул. Лесная, 12, кв. 4"),
      },
    ];
    expect(matchObject(header, withAddress)).toEqual({
      kind: "attach",
      objectId: "o4",
      by: "address",
    });
  });

  test("похожая подпись — «Возможно, это объект», ничего — «Создать новый»", () => {
    expect(matchObject(header, objects)).toMatchObject({ kind: "maybe", objectId: "o2" });
    expect(matchObject(header, [objects[0]!])).toEqual({ kind: "new" });
  });

  test("черновик объекта из шапки и запрет второго такого же", () => {
    const draft = objectDraft(header, "файл");
    expect(draft.code).toBe("77-Т-26-СМР");
    expect(draft.label).toContain("ул. Лесная, 12");
    expect(objectTaken(draft, [{ id: "o5", label: "z", code: "77-Т-26-СМР" }])?.id).toBe("o5");
    expect(objectTaken(draft, objects)).toBeNull();
  });
});

describe("версии и статусы (ADR-077)", () => {
  const s = (number: string, kopecks: number): EstimateSection => ({
    title: `Раздел ${number}`,
    kopecks,
    row: 1,
    number,
  });

  test("изменились разделы 3 и 7", () => {
    const changed = changedSections(
      [s("3", 1), s("5", 2), s("7", 3)],
      [s("3", 9), s("5", 2), s("7", 4)],
    );
    expect(changed).toEqual(["3", "7"]);
    expect(changedPhrase(changed)).toBe("изменились разделы 3 и 7");
  });

  test("тексты статусов", () => {
    expect(outcomeText({ kind: "duplicate", fileId: "f", versionId: "v", version: 1 })).toBe(
      "Уже загружена, версия 1",
    );
    expect(
      outcomeText({
        kind: "added",
        fileId: "f",
        versionId: "v",
        version: 2,
        status: "parsed",
        reason: null,
        match: { kind: "new" },
        changed: ["3", "7"],
      }),
    ).toBe("Распознана. Новая версия 2, изменились разделы 3 и 7");
  });
});
