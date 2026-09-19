import { describe, expect, test } from "bun:test";
import {
  deliveryStatus,
  enums,
  type ChecklistResult,
  type Delivery,
  type DeliveryItem,
  type DeliveryStatus,
  type ExtractedPosition,
  type Material,
} from "@/contracts";
import {
  FINAL_STATUSES,
  MOVE_STATUSES,
  acceptanceError,
  allocateToPositions,
  awaitsAcceptance,
  canMove,
  checklistFor,
  deliveredByPosition,
  deliveryFamilies,
  fullyDelivered,
  hasDiscrepancy,
  lineDiscrepancies,
  onTheWay,
  remainder,
  withDeliveries,
  type AcceptanceDraft,
  type RequestPositionLink,
} from "@/domain/deliveries";

/* ---------- Фабрики ---------- */

function line(overrides: Partial<DeliveryItem> & Pick<DeliveryItem, "id">): DeliveryItem {
  return {
    requestLineId: `rl-${overrides.id}`,
    materialId: null,
    name: "Материал",
    qty: 1,
    unit: "шт",
    price: null,
    acceptedQty: null,
    remark: null,
    ...overrides,
  };
}

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: "dl-1",
    requestId: "sr-1",
    projectId: "p-1",
    zoneId: null,
    supplierId: "c-1",
    decisionId: null,
    expectedAt: "2026-09-10",
    receivedAt: null,
    status: "arrived",
    sourceId: null,
    items: [],
    ...overrides,
  };
}

function check(id: string, ok = true): ChecklistResult {
  return { id, label: id, ok, note: null };
}

/** Общие пункты чек-листа (ADR-011, п. 6), все пройдены */
const COMMON_OK = ["complete", "intact", "docs", "spec"].map((id) => check(id));

function position(
  overrides: Partial<ExtractedPosition> & Pick<ExtractedPosition, "id">,
): ExtractedPosition {
  return {
    projectId: "p-1",
    documentId: "rev-1",
    sheetId: "sh-1",
    sheetNumber: 1,
    position: "1.1",
    group: "Подконструкция",
    family: "bracket",
    projectName: "Кронштейн",
    materialId: null,
    normalizedName: null,
    matchStatus: "none",
    matchedBy: null,
    matchedAt: null,
    characteristics: [],
    qty: 1,
    unit: "шт",
    confidence: 0.9,
    region: { x: 0, y: 0, w: 1, h: 0.1 },
    review: "confirmed",
    reviewedBy: null,
    reviewedAt: null,
    note: null,
    handedOverAt: "2026-09-01T10:00:00",
    purchase: "ordered",
    deliveredQty: null,
    requestIds: [],
    mergedInto: null,
    ...overrides,
  };
}

function material(id: string, family: string): Material {
  return {
    id,
    family,
    name: `Материал ${id}`,
    unit: "шт",
    categoryId: "cat-1",
    characteristics: [],
    synonyms: [],
    spellings: [],
  };
}

const ALL_STATUSES = deliveryStatus.values;

/* ---------- Статусы ---------- */

describe("статусы поставки", () => {
  test("финальные статусы — принято, принято с замечаниями, отклонено", () => {
    const expected: DeliveryStatus[] = ["accepted", "accepted_with_remarks", "rejected"];
    expect([...FINAL_STATUSES].sort()).toEqual(expected.sort());
  });

  test("движение до приёмки — отгружено, в пути, прибыло", () => {
    expect([...MOVE_STATUSES]).toEqual(["shipped", "in_transit", "arrived"]);
  });
});

describe("canMove", () => {
  test("по порядку вперёд — можно", () => {
    expect(canMove("expected", "shipped")).toBe(true);
    expect(canMove("shipped", "in_transit")).toBe(true);
    expect(canMove("in_transit", "arrived")).toBe(true);
    expect(canMove("arrived", "accepted")).toBe(true);
    expect(canMove("arrived", "accepted_with_remarks")).toBe(true);
  });

  test("пропуск вперёд разрешён: поставщик мог не сообщить об отгрузке", () => {
    expect(canMove("expected", "in_transit")).toBe(true);
    expect(canMove("expected", "arrived")).toBe(true);
    expect(canMove("shipped", "arrived")).toBe(true);
  });

  test("назад нельзя", () => {
    expect(canMove("shipped", "expected")).toBe(false);
    expect(canMove("in_transit", "shipped")).toBe(false);
    expect(canMove("arrived", "in_transit")).toBe(false);
    expect(canMove("arrived", "expected")).toBe(false);
  });

  test("отклонить можно на любом шаге до приёмки", () => {
    for (const from of ["expected", "shipped", "in_transit", "arrived"] as const) {
      expect(canMove(from, "rejected")).toBe(true);
    }
  });

  test("принять можно только прибывшую: из «ожидается», «отгружено», «в пути» — нельзя", () => {
    for (const from of ["expected", "shipped", "in_transit"] as const) {
      expect(canMove(from, "accepted")).toBe(false);
      expect(canMove(from, "accepted_with_remarks")).toBe(false);
    }
  });

  test("из финального статуса переходов нет", () => {
    for (const from of FINAL_STATUSES) {
      for (const to of ALL_STATUSES) expect(canMove(from, to)).toBe(false);
    }
  });

  test("переход в тот же статус — не переход", () => {
    for (const status of ALL_STATUSES) expect(canMove(status, status)).toBe(false);
  });

  test("совпадает с переходами delivery_status в контракте для каждой пары", () => {
    const meta = enums.find((item) => item.name === "delivery_status");
    expect(meta?.transitions).toBeDefined();
    const transitions = meta?.transitions ?? {};
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(canMove(from, to)).toBe((transitions[from] ?? []).includes(to));
      }
    }
  });
});

describe("awaitsAcceptance и onTheWay", () => {
  const cases: [DeliveryStatus, boolean, boolean][] = [
    // статус, ждёт приёмки, в пути
    ["expected", false, true],
    ["shipped", false, true],
    ["in_transit", false, true],
    ["arrived", true, false],
    ["accepted", false, false],
    ["accepted_with_remarks", false, false],
    ["rejected", false, false],
  ];

  for (const [status, awaits, way] of cases) {
    test(`${status}: ждёт приёмки — ${awaits}, в пути — ${way}`, () => {
      const item = delivery({ status });
      expect(awaitsAcceptance(item)).toBe(awaits);
      expect(onTheWay(item)).toBe(way);
    });
  }
});

/* ---------- Входной контроль ---------- */

describe("checklistFor", () => {
  const COMMON_IDS = ["complete", "intact", "docs", "spec"];
  const ids = (families: (string | null)[]) => checklistFor(families).map((item) => item.id);

  test("без семейств — только четыре общих пункта", () => {
    expect(ids([])).toEqual(COMMON_IDS);
  });

  test("семейство неизвестно (null) или пустое — только общие пункты", () => {
    expect(ids([null])).toEqual(COMMON_IDS);
    expect(ids([""])).toEqual(COMMON_IDS);
    expect(ids([null, null])).toEqual(COMMON_IDS);
  });

  test("семейство без дополнительных пунктов — только общие", () => {
    expect(ids(["стекло"])).toEqual(COMMON_IDS);
  });

  test("облицовка: общие + партия и тон, сколы", () => {
    expect(ids(["Керамогранит"])).toEqual([...COMMON_IDS, "batch", "chips"]);
  });

  test("утеплитель: общие + плотность, сухость упаковки", () => {
    expect(ids(["Утеплитель минераловатный"])).toEqual([...COMMON_IDS, "density", "dry"]);
  });

  test("подконструкция и крепёж: общие + покрытие, маркировка", () => {
    expect(ids(["Кронштейн"])).toEqual([...COMMON_IDS, "coating", "marking"]);
    expect(ids(["Анкер"])).toEqual([...COMMON_IDS, "coating", "marking"]);
  });

  test("регистр не важен", () => {
    expect(ids(["КЕРАМОГРАНИТ"])).toEqual([...COMMON_IDS, "batch", "chips"]);
  });

  test("два материала одного семейства — без повторов пунктов", () => {
    expect(ids(["Керамогранит", "Фасадные панели", "Керамогранит"])).toEqual([
      ...COMMON_IDS,
      "batch",
      "chips",
    ]);
  });

  test("три группы сразу: общие первыми, затем все дополнительные без повторов", () => {
    const result = ids(["Кронштейн", "Керамогранит", null, "Мембрана"]);
    // 4 общих + 2 облицовки + 2 утеплителя + 2 подконструкции = 10
    expect(result).toHaveLength(10);
    expect(result.slice(0, 4)).toEqual(COMMON_IDS);
    expect(result.slice(4).sort()).toEqual(
      ["batch", "chips", "density", "dry", "coating", "marking"].sort(),
    );
    expect(new Set(result).size).toBe(result.length);
  });

  // Контракт materials.family: «семейство: bracket, rail, tile…» — коды справочника.
  // JSDoc: «семейства — из справочника материалов», поэтому коды должны давать свои пункты.
  test("код семейства из справочника tile — пункты облицовки", () => {
    expect(ids(["tile"])).toEqual([...COMMON_IDS, "batch", "chips"]);
  });

  test("код семейства из справочника wool — пункты утеплителя", () => {
    expect(ids(["wool"])).toEqual([...COMMON_IDS, "density", "dry"]);
  });

  test("коды семейств из справочника bracket и rail — пункты подконструкции", () => {
    expect(ids(["bracket"])).toEqual([...COMMON_IDS, "coating", "marking"]);
    expect(ids(["rail"])).toEqual([...COMMON_IDS, "coating", "marking"]);
  });
});

describe("deliveryFamilies", () => {
  const materials = [material("m-1", "tile"), material("m-2", "bracket")];

  test("семейство каждой строки по справочнику, в порядке строк", () => {
    const item = delivery({
      items: [line({ id: "a", materialId: "m-2" }), line({ id: "b", materialId: "m-1" })],
    });
    expect(deliveryFamilies(item, materials)).toEqual(["bracket", "tile"]);
  });

  test("строка без материала — null", () => {
    const item = delivery({ items: [line({ id: "a", materialId: null })] });
    expect(deliveryFamilies(item, materials)).toEqual([null]);
  });

  test("материала нет в справочнике — null", () => {
    const item = delivery({ items: [line({ id: "a", materialId: "m-404" })] });
    expect(deliveryFamilies(item, materials)).toEqual([null]);
  });

  test("пустая поставка и пустой справочник — пустой список", () => {
    expect(deliveryFamilies(delivery({ items: [] }), materials)).toEqual([]);
    const item = delivery({ items: [line({ id: "a", materialId: "m-1" })] });
    expect(deliveryFamilies(item, [])).toEqual([null]);
  });
});

/* ---------- Приёмка ---------- */

/** Поставка из двух строк: 100 шт и 50 шт, прибыла */
const TWO_LINES = delivery({
  items: [line({ id: "l-1", qty: 100 }), line({ id: "l-2", qty: 50 })],
});

function draft(overrides: Partial<AcceptanceDraft> = {}): AcceptanceDraft {
  return {
    result: "accepted",
    lines: [
      { lineId: "l-1", acceptedQty: 100, remark: null },
      { lineId: "l-2", acceptedQty: 50, remark: null },
    ],
    checklist: COMMON_OK,
    photos: 0,
    reason: null,
    confirmed: true,
    ...overrides,
  };
}

function facts(first: number, second: number) {
  return [
    { lineId: "l-1", acceptedQty: first, remark: null },
    { lineId: "l-2", acceptedQty: second, remark: null },
  ];
}

describe("lineDiscrepancies", () => {
  test("факт равен заявленному — расхождений нет", () => {
    expect(lineDiscrepancies(TWO_LINES, { lines: facts(100, 50) })).toEqual([]);
  });

  test("недостача на одну единицу", () => {
    expect(lineDiscrepancies(TWO_LINES, { lines: facts(99, 50) })).toEqual([
      { lineId: "l-1", kind: "shortage", declared: 100, accepted: 99 },
    ]);
  });

  test("излишек на одну единицу", () => {
    expect(lineDiscrepancies(TWO_LINES, { lines: facts(100, 51) })).toEqual([
      { lineId: "l-2", kind: "surplus", declared: 50, accepted: 51 },
    ]);
  });

  test("недостача и излишек в разных строках — по строке на каждое", () => {
    expect(lineDiscrepancies(TWO_LINES, { lines: facts(80, 60) })).toEqual([
      { lineId: "l-1", kind: "shortage", declared: 100, accepted: 80 },
      { lineId: "l-2", kind: "surplus", declared: 50, accepted: 60 },
    ]);
  });

  test("ноль принято — недостача на всё заявленное", () => {
    expect(lineDiscrepancies(TWO_LINES, { lines: facts(0, 50) })).toEqual([
      { lineId: "l-1", kind: "shortage", declared: 100, accepted: 0 },
    ]);
  });

  test("строка без факта не считается расхождением", () => {
    const lines = [{ lineId: "l-2", acceptedQty: 50, remark: null }];
    expect(lineDiscrepancies(TWO_LINES, { lines })).toEqual([]);
  });

  test("дробное количество: 12,5 против 12,4 — недостача", () => {
    const item = delivery({ items: [line({ id: "m", qty: 12.5, unit: "м²" })] });
    const lines = [{ lineId: "m", acceptedQty: 12.4, remark: null }];
    expect(lineDiscrepancies(item, { lines })).toEqual([
      { lineId: "m", kind: "shortage", declared: 12.5, accepted: 12.4 },
    ]);
  });

  test("поставка без строк — пусто", () => {
    expect(lineDiscrepancies(delivery({ items: [] }), { lines: [] })).toEqual([]);
  });
});

describe("hasDiscrepancy", () => {
  test("строки совпали, чек-лист пройден — расхождения нет", () => {
    expect(hasDiscrepancy(TWO_LINES, { lines: facts(100, 50), checklist: COMMON_OK })).toBe(false);
  });

  test("расхождение по строке", () => {
    expect(hasDiscrepancy(TWO_LINES, { lines: facts(100, 49), checklist: COMMON_OK })).toBe(true);
  });

  test("один непройденный пункт чек-листа — расхождение", () => {
    const checklist = [...COMMON_OK.slice(0, 3), check("spec", false)];
    expect(hasDiscrepancy(TWO_LINES, { lines: facts(100, 50), checklist })).toBe(true);
  });

  test("пустой чек-лист сам по себе расхождением не считается", () => {
    expect(hasDiscrepancy(TWO_LINES, { lines: facts(100, 50), checklist: [] })).toBe(false);
  });
});

describe("acceptanceError", () => {
  const NOT_ARRIVED = "Принять можно только прибывшую поставку";
  const NOT_CONFIRMED = "Подтвердите приёмку от своего имени";
  const EACH_LINE = "Укажите факт по каждой строке";
  const NEGATIVE = "Фактическое количество не может быть отрицательным";
  const CHECKLIST = "Пройдите чек-лист входного контроля";
  const NO_REASON = "Укажите причину отклонения";
  const HAS_DISCREPANCY = "Есть расхождение: принять можно только с замечаниями или отклонить";
  const NO_DISCREPANCY = "Расхождений нет: примите поставку полностью";
  const PHOTO = "При расхождении нужно хотя бы одно фото";

  test("полностью без расхождений и без фото — акт пишется", () => {
    expect(acceptanceError(TWO_LINES, draft())).toBeNull();
  });

  test("принять можно только прибывшую поставку", () => {
    for (const status of ["expected", "shipped", "in_transit"] as const) {
      expect(acceptanceError({ ...TWO_LINES, status }, draft())).toBe(NOT_ARRIVED);
    }
  });

  test("повторная приёмка уже закрытой поставки запрещена", () => {
    for (const status of FINAL_STATUSES) {
      expect(acceptanceError({ ...TWO_LINES, status }, draft())).toBe(NOT_ARRIVED);
    }
  });

  test("без подтверждения принявшего акт не пишется", () => {
    expect(acceptanceError(TWO_LINES, draft({ confirmed: false }))).toBe(NOT_CONFIRMED);
  });

  test("факт не по всем строкам", () => {
    const lines = [{ lineId: "l-1", acceptedQty: 100, remark: null }];
    expect(acceptanceError(TWO_LINES, draft({ lines }))).toBe(EACH_LINE);
  });

  test("лишняя строка факта", () => {
    const lines = [...facts(100, 50), { lineId: "l-3", acceptedQty: 1, remark: null }];
    expect(acceptanceError(TWO_LINES, draft({ lines }))).toBe(EACH_LINE);
  });

  test("две записи факта по одной строке и ни одной по другой — факт не по каждой строке", () => {
    const lines = [
      { lineId: "l-1", acceptedQty: 100, remark: null },
      { lineId: "l-1", acceptedQty: 100, remark: null },
    ];
    expect(acceptanceError(TWO_LINES, draft({ lines }))).toBe(EACH_LINE);
  });

  test("отрицательный факт, NaN и бесконечность — отказ", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(acceptanceError(TWO_LINES, draft({ lines: facts(100, bad) }))).toBe(NEGATIVE);
    }
  });

  test("ноль принято — допустимый факт: недостача с замечаниями и фото", () => {
    const result = acceptanceError(
      TWO_LINES,
      draft({ result: "accepted_with_remarks", lines: facts(0, 50), photos: 1 }),
    );
    expect(result).toBeNull();
  });

  test("чек-лист короче общих пунктов (3 из 4) — отказ", () => {
    expect(acceptanceError(TWO_LINES, draft({ checklist: COMMON_OK.slice(0, 3) }))).toBe(CHECKLIST);
  });

  test("пустой чек-лист — отказ", () => {
    expect(acceptanceError(TWO_LINES, draft({ checklist: [] }))).toBe(CHECKLIST);
  });

  test("принять полностью при недостаче — отказ", () => {
    const result = acceptanceError(TWO_LINES, draft({ lines: facts(99, 50), photos: 1 }));
    expect(result).toBe(HAS_DISCREPANCY);
  });

  test("принять полностью при излишке — отказ", () => {
    const result = acceptanceError(TWO_LINES, draft({ lines: facts(100, 51), photos: 1 }));
    expect(result).toBe(HAS_DISCREPANCY);
  });

  test("принять полностью при непройденном пункте чек-листа — отказ", () => {
    const checklist = [...COMMON_OK.slice(0, 3), check("spec", false)];
    expect(acceptanceError(TWO_LINES, draft({ checklist, photos: 1 }))).toBe(HAS_DISCREPANCY);
  });

  test("с замечаниями без расхождений — отказ", () => {
    const result = acceptanceError(
      TWO_LINES,
      draft({ result: "accepted_with_remarks", photos: 1 }),
    );
    expect(result).toBe(NO_DISCREPANCY);
  });

  test("с замечаниями при расхождении без фото — отказ, с одним фото — можно", () => {
    const base = { result: "accepted_with_remarks" as const, lines: facts(90, 50) };
    expect(acceptanceError(TWO_LINES, draft({ ...base, photos: 0 }))).toBe(PHOTO);
    expect(acceptanceError(TWO_LINES, draft({ ...base, photos: 1 }))).toBeNull();
  });

  test("с замечаниями при излишке и фото — можно", () => {
    const result = acceptanceError(
      TWO_LINES,
      draft({ result: "accepted_with_remarks", lines: facts(100, 70), photos: 2 }),
    );
    expect(result).toBeNull();
  });

  test("с замечаниями по непройденному пункту чек-листа и фото — можно", () => {
    const checklist = [check("complete"), check("intact", false), check("docs"), check("spec")];
    const result = acceptanceError(
      TWO_LINES,
      draft({ result: "accepted_with_remarks", checklist, photos: 1 }),
    );
    expect(result).toBeNull();
  });

  test("отклонение без причины: null, пустая строка и пробелы — отказ", () => {
    for (const reason of [null, "", "   "]) {
      const result = acceptanceError(
        TWO_LINES,
        draft({ result: "rejected", reason, lines: facts(10, 50), photos: 1 }),
      );
      expect(result).toBe(NO_REASON);
    }
  });

  test("отклонение при расхождении с причиной, но без фото — отказ", () => {
    const result = acceptanceError(
      TWO_LINES,
      draft({ result: "rejected", reason: "Бой стекла", lines: facts(10, 50), photos: 0 }),
    );
    expect(result).toBe(PHOTO);
  });

  test("отклонение с причиной и фото — акт пишется", () => {
    const result = acceptanceError(
      TWO_LINES,
      draft({ result: "rejected", reason: "Не та марка", lines: facts(10, 50), photos: 1 }),
    );
    expect(result).toBeNull();
  });
});

/* ---------- Связь с материалами ---------- */

describe("allocateToPositions", () => {
  const AB = [
    { id: "a", qty: 100 },
    { id: "b", qty: 50 },
  ];

  test("нет позиций — нечего раскладывать", () => {
    expect(allocateToPositions(10, [])).toEqual([]);
  });

  test("принято ровно сумма позиций — каждая получает своё", () => {
    expect(allocateToPositions(150, AB)).toEqual([
      { positionId: "a", delivered: 100 },
      { positionId: "b", delivered: 50 },
    ]);
  });

  test("недостача: по порядку, первая заполняется целиком", () => {
    // 120 = 100 первой + 20 второй
    expect(allocateToPositions(120, AB)).toEqual([
      { positionId: "a", delivered: 100 },
      { positionId: "b", delivered: 20 },
    ]);
  });

  test("принято меньше первой позиции — остальным ноль", () => {
    expect(allocateToPositions(60, AB)).toEqual([
      { positionId: "a", delivered: 60 },
      { positionId: "b", delivered: 0 },
    ]);
  });

  test("ровно количество первой позиции — второй ноль", () => {
    expect(allocateToPositions(100, AB)).toEqual([
      { positionId: "a", delivered: 100 },
      { positionId: "b", delivered: 0 },
    ]);
  });

  test("ноль принято — всем ноль", () => {
    expect(allocateToPositions(0, AB)).toEqual([
      { positionId: "a", delivered: 0 },
      { positionId: "b", delivered: 0 },
    ]);
  });

  test("излишек остаётся на последней позиции", () => {
    // 170 = 100 первой + 50 второй + 20 излишка на второй → 70
    expect(allocateToPositions(170, AB)).toEqual([
      { positionId: "a", delivered: 100 },
      { positionId: "b", delivered: 70 },
    ]);
  });

  test("излишек на одну единицу — на последней", () => {
    expect(allocateToPositions(151, AB)).toEqual([
      { positionId: "a", delivered: 100 },
      { positionId: "b", delivered: 51 },
    ]);
  });

  test("одна позиция забирает всё: и недостачу, и излишек", () => {
    expect(allocateToPositions(7, [{ id: "a", qty: 10 }])).toEqual([
      { positionId: "a", delivered: 7 },
    ]);
    expect(allocateToPositions(15, [{ id: "a", qty: 10 }])).toEqual([
      { positionId: "a", delivered: 15 },
    ]);
  });

  test("позиция с нулевым количеством в середине пропускается", () => {
    const positions = [
      { id: "a", qty: 10 },
      { id: "b", qty: 0 },
      { id: "c", qty: 10 },
    ];
    // 25 = 10 первой + 0 второй + 10 третьей + 5 излишка на третьей → 15
    expect(allocateToPositions(25, positions)).toEqual([
      { positionId: "a", delivered: 10 },
      { positionId: "b", delivered: 0 },
      { positionId: "c", delivered: 15 },
    ]);
  });

  test("отрицательное принятое не даёт отрицательных поставок", () => {
    expect(allocateToPositions(-5, AB)).toEqual([
      { positionId: "a", delivered: 0 },
      { positionId: "b", delivered: 0 },
    ]);
  });

  test("сумма разложенного равна принятому", () => {
    for (const accepted of [0, 1, 99, 100, 101, 149, 150, 151, 1000]) {
      const total = allocateToPositions(accepted, AB).reduce((acc, s) => acc + s.delivered, 0);
      expect(total).toBe(accepted);
    }
  });
});

describe("remainder", () => {
  test("поставок не было (null) — остаток равен заказанному", () => {
    expect(remainder({ qty: 100, deliveredQty: null })).toBe(100);
  });

  test("поставлено 0 — остаток равен заказанному", () => {
    expect(remainder({ qty: 100, deliveredQty: 0 })).toBe(100);
  });

  test("поставлено частично: 100 − 40 = 60", () => {
    expect(remainder({ qty: 100, deliveredQty: 40 })).toBe(60);
  });

  test("не хватает одной единицы: 100 − 99 = 1", () => {
    expect(remainder({ qty: 100, deliveredQty: 99 })).toBe(1);
  });

  test("поставлено ровно — остаток 0", () => {
    expect(remainder({ qty: 100, deliveredQty: 100 })).toBe(0);
  });

  test("излишек — остаток не меньше нуля", () => {
    expect(remainder({ qty: 100, deliveredQty: 120 })).toBe(0);
  });
});

describe("fullyDelivered", () => {
  test("поставок не было — не поставлено", () => {
    expect(fullyDelivered({ qty: 100, deliveredQty: null })).toBe(false);
  });

  test("на единицу меньше — не поставлено", () => {
    expect(fullyDelivered({ qty: 100, deliveredQty: 99 })).toBe(false);
  });

  test("ровно заказанное — поставлено", () => {
    expect(fullyDelivered({ qty: 100, deliveredQty: 100 })).toBe(true);
  });

  test("излишек — поставлено", () => {
    expect(fullyDelivered({ qty: 100, deliveredQty: 101 })).toBe(true);
  });

  test("дробное количество: 12,49 из 12,5 — не поставлено", () => {
    expect(fullyDelivered({ qty: 12.5, deliveredQty: 12.49 })).toBe(false);
  });
});

/* ---------- Поставлено по позициям ---------- */

/** Позиции: a — 100, b — 50 (строка rl-1); c — 30 (строка rl-2) */
const POSITIONS = [
  { id: "a", qty: 100 },
  { id: "b", qty: 50 },
  { id: "c", qty: 30 },
];
const LINKS: RequestPositionLink[] = [
  { requestLineId: "rl-1", positionId: "a" },
  { requestLineId: "rl-1", positionId: "b" },
  { requestLineId: "rl-2", positionId: "c" },
];

function accepted(
  status: DeliveryStatus,
  lines: [requestLineId: string, acceptedQty: number | null][],
  id = "dl-1",
): Delivery {
  return delivery({
    id,
    status,
    items: lines.map(([requestLineId, acceptedQty], index) =>
      line({ id: `${id}-${index}`, requestLineId, qty: acceptedQty ?? 1, acceptedQty }),
    ),
  });
}

describe("deliveredByPosition", () => {
  test("нет поставок — пустой результат", () => {
    expect(deliveredByPosition([], LINKS, POSITIONS).size).toBe(0);
  });

  test("принятая поставка раскладывается по позициям строки", () => {
    const result = deliveredByPosition(
      [
        accepted("accepted", [
          ["rl-1", 120],
          ["rl-2", 30],
        ]),
      ],
      LINKS,
      POSITIONS,
    );
    // rl-1: 120 → a 100, b 20; rl-2: 30 → c 30
    expect(Object.fromEntries(result)).toEqual({ a: 100, b: 20, c: 30 });
  });

  test("принятая с замечаниями тоже считается", () => {
    const result = deliveredByPosition(
      [accepted("accepted_with_remarks", [["rl-2", 25]])],
      LINKS,
      POSITIONS,
    );
    expect(Object.fromEntries(result)).toEqual({ c: 25 });
  });

  test("отклонённая и непринятые поставки не считаются, даже с заполненным фактом", () => {
    for (const status of ["rejected", "arrived", "in_transit", "shipped", "expected"] as const) {
      const result = deliveredByPosition([accepted(status, [["rl-1", 150]])], LINKS, POSITIONS);
      expect(result.size).toBe(0);
    }
  });

  test("строка без факта (null) пропускается", () => {
    const result = deliveredByPosition(
      [
        accepted("accepted", [
          ["rl-1", null],
          ["rl-2", 30],
        ]),
      ],
      LINKS,
      POSITIONS,
    );
    expect(Object.fromEntries(result)).toEqual({ c: 30 });
  });

  test("принято 0 — позиции получают 0, а не остаются без поставок", () => {
    const result = deliveredByPosition([accepted("accepted", [["rl-2", 0]])], LINKS, POSITIONS);
    expect(result.get("c")).toBe(0);
  });

  test("излишек строки — на последней позиции строки", () => {
    const result = deliveredByPosition([accepted("accepted", [["rl-1", 170]])], LINKS, POSITIONS);
    // 170 → a 100, b 50 + 20 излишка = 70
    expect(Object.fromEntries(result)).toEqual({ a: 100, b: 70 });
  });

  test("позиция в строках двух поставок — поставленное суммируется", () => {
    const links: RequestPositionLink[] = [
      { requestLineId: "rl-1", positionId: "a" },
      { requestLineId: "rl-9", positionId: "a" },
    ];
    const result = deliveredByPosition(
      [accepted("accepted", [["rl-1", 60]], "dl-1"), accepted("accepted", [["rl-9", 40]], "dl-2")],
      links,
      POSITIONS,
    );
    // 60 + 40 = 100
    expect(Object.fromEntries(result)).toEqual({ a: 100 });
  });

  test("строка без связанных позиций ничего не даёт", () => {
    const result = deliveredByPosition([accepted("accepted", [["rl-7", 10]])], LINKS, POSITIONS);
    expect(result.size).toBe(0);
  });

  test("связь на позицию вне списка игнорируется", () => {
    const links: RequestPositionLink[] = [
      { requestLineId: "rl-1", positionId: "ghost" },
      { requestLineId: "rl-1", positionId: "b" },
    ];
    const result = deliveredByPosition([accepted("accepted", [["rl-1", 30]])], links, POSITIONS);
    expect(Object.fromEntries(result)).toEqual({ b: 30 });
  });
});

describe("withDeliveries", () => {
  const positions = [
    position({ id: "a", qty: 100 }),
    position({ id: "b", qty: 50 }),
    position({ id: "c", qty: 30, purchase: "supplier_selected" }),
    position({ id: "d", qty: 10 }),
  ];

  test("без поставок позиции не меняются", () => {
    expect(withDeliveries(positions, [], LINKS)).toEqual(positions);
  });

  test("поставлено всё по заказанной позиции — «поставлено» с фактом", () => {
    const [a, b] = withDeliveries(positions, [accepted("accepted", [["rl-1", 150]])], LINKS);
    expect(a).toEqual({ ...positions[0]!, deliveredQty: 100, purchase: "delivered" });
    expect(b).toEqual({ ...positions[1]!, deliveredQty: 50, purchase: "delivered" });
  });

  test("поставлено не всё — остаётся «заказано» с фактом", () => {
    const [a, b] = withDeliveries(positions, [accepted("accepted", [["rl-1", 120]])], LINKS);
    expect(a?.purchase).toBe("delivered");
    expect(a?.deliveredQty).toBe(100);
    expect(b).toEqual({ ...positions[1]!, deliveredQty: 20, purchase: "ordered" });
  });

  test("излишек на последней позиции — обе поставлены", () => {
    const [a, b] = withDeliveries(positions, [accepted("accepted", [["rl-1", 170]])], LINKS);
    expect(a?.deliveredQty).toBe(100);
    expect(b?.deliveredQty).toBe(70);
    expect(a?.purchase).toBe("delivered");
    expect(b?.purchase).toBe("delivered");
  });

  test("до заказа «поставлено» не ставится: переход только ordered → delivered", () => {
    const result = withDeliveries(positions, [accepted("accepted", [["rl-2", 30]])], LINKS);
    expect(result[2]).toEqual({ ...positions[2]!, deliveredQty: 30 });
  });

  test("позиция без связей с поставками не трогается", () => {
    const result = withDeliveries(positions, [accepted("accepted", [["rl-1", 150]])], LINKS);
    expect(result[3]).toEqual(positions[3]!);
  });

  test("входные позиции не изменяются", () => {
    withDeliveries(positions, [accepted("accepted", [["rl-1", 150]])], LINKS);
    expect(positions[0]?.deliveredQty).toBeNull();
    expect(positions[0]?.purchase).toBe("ordered");
  });
});
