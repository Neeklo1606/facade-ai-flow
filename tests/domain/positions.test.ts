import { describe, expect, test } from "bun:test";
import type { ExtractedPosition, PositionReview } from "@/contracts";
import {
  byAttention,
  inProcurement,
  inScope,
  isAutoVerified,
  matchesFilter,
  matchesView,
  positionFacets,
  positionViews,
  type PositionFilter,
} from "@/domain/positions";

/** Позиция с заполненными обязательными полями: непроверенная, уверенная, не передана */
function position(overrides: Partial<ExtractedPosition> = {}): ExtractedPosition {
  return {
    id: "pos-1",
    projectId: "p-1",
    documentId: "rev-1",
    sheetId: "sh-1",
    sheetNumber: 84,
    position: "1.1",
    group: "Подконструкция",
    family: "bracket",
    projectName: "Кронштейн несущий",
    materialId: "mat-1",
    normalizedName: "Кронштейн КН-1",
    characteristics: [{ label: "Покрытие", value: "цинк" }],
    qty: 10,
    unit: "шт",
    confidence: 0.9,
    region: { x: 0, y: 0, w: 1, h: 0.05 },
    review: "pending",
    reviewedBy: null,
    reviewedAt: null,
    note: null,
    handedOverAt: null,
    purchase: "none",
    deliveredQty: null,
    requestIds: [],
    mergedInto: null,
    ...overrides,
  };
}

/** Проверенная человеком позиция */
function reviewed(overrides: Partial<ExtractedPosition> = {}): ExtractedPosition {
  return position({
    review: "confirmed",
    reviewedBy: "e-volkova",
    reviewedAt: "2026-09-01T10:00:00",
    ...overrides,
  });
}

/** Проверенная и переданная в закупку позиция */
function handedOver(overrides: Partial<ExtractedPosition> = {}): ExtractedPosition {
  return reviewed({ handedOverAt: "2026-09-02T10:00:00", ...overrides });
}

const allReviews: PositionReview[] = [
  "pending",
  "confirmed",
  "corrected",
  "excluded",
  "merged",
  "header",
];

const ids = (items: ExtractedPosition[]) => items.map((item) => item.id);

describe("matchesView", () => {
  test("«active»: всё, кроме исключённых, объединённых и заголовков", () => {
    const result = allReviews.map((review) => matchesView(position({ review }), "active"));
    expect(result).toEqual([true, true, true, false, false, false]);
  });

  test("«verified»: только подтверждённые и исправленные", () => {
    const result = allReviews.map((review) => matchesView(position({ review }), "verified"));
    expect(result).toEqual([false, true, true, false, false, false]);
  });

  test("«pending»: только непроверенные, при любой уверенности", () => {
    expect(matchesView(position({ confidence: 0 }), "pending")).toBe(true);
    expect(matchesView(position({ confidence: 1 }), "pending")).toBe(true);
    expect(matchesView(reviewed(), "pending")).toBe(false);
    expect(matchesView(position({ review: "excluded" }), "pending")).toBe(false);
  });

  test("«attention»: непроверенные с уверенностью от 0,70 до 0,85, нижняя граница включена", () => {
    expect(matchesView(position({ confidence: 0.7 }), "attention")).toBe(true);
    expect(matchesView(position({ confidence: 0.8499 }), "attention")).toBe(true);
    expect(matchesView(position({ confidence: 0.85 }), "attention")).toBe(false);
    expect(matchesView(position({ confidence: 0.6999 }), "attention")).toBe(false);
  });

  test("«attention»: проверенная человеком позиция внимания не требует", () => {
    expect(matchesView(reviewed({ confidence: 0.75 }), "attention")).toBe(false);
  });

  test("«check»: непроверенные с уверенностью ниже 0,70", () => {
    expect(matchesView(position({ confidence: 0 }), "check")).toBe(true);
    expect(matchesView(position({ confidence: 0.6999 }), "check")).toBe(true);
    expect(matchesView(position({ confidence: 0.7 }), "check")).toBe(false);
    expect(matchesView(reviewed({ confidence: 0.5 }), "check")).toBe(false);
  });

  test("«excluded»: исключённые, объединённые и заголовки", () => {
    const result = allReviews.map((review) => matchesView(position({ review }), "excluded"));
    expect(result).toEqual([false, false, false, true, true, true]);
  });

  test("«all»: любая позиция", () => {
    const result = allReviews.map((review) =>
      matchesView(position({ review, confidence: 0.1 }), "all"),
    );
    expect(result).toEqual([true, true, true, true, true, true]);
  });
});

describe("inProcurement", () => {
  test("проверенная и переданная позиция — в закупке", () => {
    expect(inProcurement(handedOver())).toBe(true);
    expect(inProcurement(handedOver({ review: "corrected" }))).toBe(true);
  });

  test("проверенная, но не переданная — не в закупке", () => {
    expect(inProcurement(reviewed())).toBe(false);
  });

  test("непроверенная с отметкой передачи — не в закупке", () => {
    expect(inProcurement(position({ handedOverAt: "2026-09-02T10:00:00" }))).toBe(false);
  });
});

describe("inScope", () => {
  test("пустой фильтр пропускает любую позицию", () => {
    expect(inScope(position({ projectId: "p-9", documentId: "rev-9" }), {})).toBe(true);
  });

  test("объект: совпадение и несовпадение", () => {
    expect(inScope(position(), { projectId: "p-1" })).toBe(true);
    expect(inScope(position(), { projectId: "p-2" })).toBe(false);
  });

  test("ревизия сравнивается с documentId позиции", () => {
    expect(inScope(position(), { revisionId: "rev-1" })).toBe(true);
    expect(inScope(position(), { revisionId: "rev-2" })).toBe(false);
  });

  test("объект и ревизия вместе: нужны оба совпадения", () => {
    expect(inScope(position(), { projectId: "p-1", revisionId: "rev-1" })).toBe(true);
    expect(inScope(position(), { projectId: "p-1", revisionId: "rev-2" })).toBe(false);
    expect(inScope(position(), { projectId: "p-2", revisionId: "rev-1" })).toBe(false);
  });

  test("область не зависит от вида, листа и раздела", () => {
    const excluded = position({ review: "excluded", sheetId: "sh-9", group: "Облицовка" });
    expect(inScope(excluded, { projectId: "p-1", view: "verified", sheetId: "sh-1" })).toBe(true);
  });
});

describe("matchesFilter", () => {
  test("без вида действует «active»: исключённая не проходит", () => {
    expect(matchesFilter(position(), {})).toBe(true);
    expect(matchesFilter(position({ review: "excluded" }), {})).toBe(false);
    expect(matchesFilter(position({ review: "header" }), {})).toBe(false);
  });

  test("вид «all» пропускает исключённую", () => {
    expect(matchesFilter(position({ review: "merged" }), { view: "all" })).toBe(true);
  });

  test("лист и раздел", () => {
    expect(matchesFilter(position(), { sheetId: "sh-1" })).toBe(true);
    expect(matchesFilter(position(), { sheetId: "sh-2" })).toBe(false);
    expect(matchesFilter(position(), { group: "Подконструкция" })).toBe(true);
    expect(matchesFilter(position(), { group: "Облицовка" })).toBe(false);
  });

  test("этап закупки: совпадение этапа у позиции в закупке", () => {
    const ordered = handedOver({ purchase: "ordered" });
    expect(matchesFilter(ordered, { stage: "ordered" })).toBe(true);
    expect(matchesFilter(ordered, { stage: "requested" })).toBe(false);
  });

  test("этап «none» требует передачи в закупку", () => {
    expect(matchesFilter(handedOver({ purchase: "none" }), { stage: "none" })).toBe(true);
    expect(matchesFilter(reviewed({ purchase: "none" }), { stage: "none" })).toBe(false);
    expect(matchesFilter(position({ purchase: "none" }), { stage: "none" })).toBe(false);
  });

  test("характеристики: с ними и без них, пустой список — «без»", () => {
    const withChars = position();
    const withoutChars = position({ characteristics: [] });
    expect(matchesFilter(withChars, { chars: "with" })).toBe(true);
    expect(matchesFilter(withoutChars, { chars: "with" })).toBe(false);
    expect(matchesFilter(withChars, { chars: "without" })).toBe(false);
    expect(matchesFilter(withoutChars, { chars: "without" })).toBe(true);
  });

  test("«готовы к запросу»: проверена, передана, этап «none»", () => {
    expect(matchesFilter(handedOver(), { readyForRequest: true })).toBe(true);
    expect(matchesFilter(handedOver({ purchase: "requested" }), { readyForRequest: true })).toBe(
      false,
    );
    expect(matchesFilter(reviewed(), { readyForRequest: true })).toBe(false);
    expect(matchesFilter(position(), { readyForRequest: true })).toBe(false);
  });

  test("readyForRequest: false не фильтрует", () => {
    expect(matchesFilter(position(), { readyForRequest: false })).toBe(true);
  });

  test("условия складываются через «и»", () => {
    const items = [
      handedOver({ id: "match", sheetId: "sh-1", group: "Облицовка", purchase: "none" }),
      handedOver({ id: "other-sheet", sheetId: "sh-2", group: "Облицовка", purchase: "none" }),
      handedOver({ id: "other-group", sheetId: "sh-1", group: "Крепёж", purchase: "none" }),
      handedOver({
        id: "no-chars",
        sheetId: "sh-1",
        group: "Облицовка",
        purchase: "none",
        characteristics: [],
      }),
      handedOver({ id: "requested", sheetId: "sh-1", group: "Облицовка", purchase: "requested" }),
      reviewed({ id: "not-handed", sheetId: "sh-1", group: "Облицовка" }),
      handedOver({ id: "other-project", projectId: "p-2", sheetId: "sh-1", group: "Облицовка" }),
    ];
    const filter: PositionFilter = {
      projectId: "p-1",
      sheetId: "sh-1",
      group: "Облицовка",
      view: "verified",
      chars: "with",
      readyForRequest: true,
    };
    expect(ids(items.filter((item) => matchesFilter(item, filter)))).toEqual(["match"]);
  });
});

describe("byAttention", () => {
  test("сначала непроверенные, внутри — от низкой уверенности к высокой", () => {
    const items = [
      reviewed({ id: "v-high", confidence: 0.95 }),
      position({ id: "p-high", confidence: 0.9 }),
      position({ id: "p-check", confidence: 0.5 }),
      reviewed({ id: "v-low", review: "corrected", confidence: 0.6 }),
      position({ id: "p-clarify", confidence: 0.75 }),
    ];
    expect(ids([...items].sort(byAttention))).toEqual([
      "p-check",
      "p-clarify",
      "p-high",
      "v-low",
      "v-high",
    ]);
  });

  test("проверенная позиция идёт после непроверенной даже при более низкой уверенности", () => {
    const low = reviewed({ confidence: 0.1 });
    const high = position({ confidence: 0.99 });
    expect(byAttention(low, high)).toBeGreaterThan(0);
    expect(byAttention(high, low)).toBeLessThan(0);
  });

  test("граница 0,85: уверенность 0,85 идёт после 0,8499", () => {
    const items = [
      position({ id: "at-threshold", confidence: 0.85 }),
      position({ id: "below", confidence: 0.8499 }),
    ];
    expect(ids([...items].sort(byAttention))).toEqual(["below", "at-threshold"]);
  });

  test("одна группа и один уровень — равны, порядок сохраняется", () => {
    const a = position({ id: "a", confidence: 0.72 });
    const b = position({ id: "b", confidence: 0.84 });
    expect(byAttention(a, b)).toBe(0);
    expect(ids([b, a].sort(byAttention))).toEqual(["b", "a"]);
  });
});

describe("isAutoVerified", () => {
  test("непроверенная с уверенностью ровно 0,85 — можно подтвердить без правки", () => {
    expect(isAutoVerified(position({ confidence: 0.85 }))).toBe(true);
  });

  test("непроверенная с уверенностью 1 — да, с 0,8499 — нет", () => {
    expect(isAutoVerified(position({ confidence: 1 }))).toBe(true);
    expect(isAutoVerified(position({ confidence: 0.8499 }))).toBe(false);
  });

  test("проверенная или исключённая позиция не считается", () => {
    expect(isAutoVerified(reviewed({ confidence: 0.95 }))).toBe(false);
    expect(isAutoVerified(position({ review: "excluded", confidence: 0.95 }))).toBe(false);
  });
});

describe("positionFacets", () => {
  const scope: PositionFilter = { projectId: "p-1", revisionId: "rev-1" };

  // Область: объект p-1, ревизия rev-1. Листы sh-1, sh-2, sh-3; разделы G1, G2.
  const items: ExtractedPosition[] = [
    position({ id: "a", sheetId: "sh-1", group: "G1", confidence: 0.9 }),
    position({ id: "b", sheetId: "sh-1", group: "G1", confidence: 0.75 }),
    position({ id: "c", sheetId: "sh-2", group: "G2", confidence: 0.5, characteristics: [] }),
    handedOver({ id: "d", sheetId: "sh-1", group: "G1", confidence: 0.95, purchase: "none" }),
    handedOver({
      id: "e",
      sheetId: "sh-2",
      group: "G2",
      review: "corrected",
      confidence: 0.6,
      purchase: "ordered",
    }),
    reviewed({
      id: "f",
      sheetId: "sh-2",
      group: "G1",
      normalizedName: null,
      materialId: null,
      characteristics: [],
    }),
    reviewed({ id: "g", sheetId: "sh-1", group: "G2", review: "corrected" }),
    position({ id: "h", sheetId: "sh-3", group: "G1", review: "excluded", confidence: 0.95 }),
    position({
      id: "i",
      sheetId: "sh-1",
      group: "G1",
      review: "merged",
      mergedInto: "a",
      confidence: 0.4,
    }),
    position({ id: "j", sheetId: "sh-1", group: "G2", review: "header", confidence: 0.99 }),
    // вне области
    position({ id: "other-project", projectId: "p-2", sheetId: "sh-1", group: "G1" }),
    position({ id: "old-revision", documentId: "rev-0", sheetId: "sh-1", group: "G1" }),
  ];

  const bySheet = <T extends { sheetId: string }>(list: T[]) =>
    [...list].sort((x, y) => x.sheetId.localeCompare(y.sheetId));
  const byGroup = <T extends { group: string }>(list: T[]) =>
    [...list].sort((x, y) => x.group.localeCompare(y.group));

  test("пустой список: все счётчики нулевые, ключи видов и этапов на месте", () => {
    const facets = positionFacets([], scope);
    expect(facets.views).toEqual({
      active: 0,
      verified: 0,
      pending: 0,
      attention: 0,
      check: 0,
      excluded: 0,
      all: 0,
    });
    expect(facets.stages).toEqual({
      none: 0,
      requested: 0,
      offers: 0,
      supplier_selected: 0,
      ordered: 0,
      delivered: 0,
    });
    expect(facets.sheets).toEqual([]);
    expect(facets.groups).toEqual([]);
    expect(facets.autoVerified).toBe(0);
    expect(facets.readyForRequest).toBe(0);
    expect(facets.handOver).toEqual({ count: 0, needNormalization: 0, withoutCharacteristics: 0 });
  });

  test("виды проверки считаются по области", () => {
    // active: a b c d e f g = 7; verified: d e f g = 4; pending: a b c = 3;
    // attention: b (0,75); check: c (0,5); excluded: h i j = 3; all: 10
    expect(positionFacets(items, scope).views).toEqual({
      active: 7,
      verified: 4,
      pending: 3,
      attention: 1,
      check: 1,
      excluded: 3,
      all: 10,
    });
  });

  test("проверено + непроверено = всего; активные + исключённые = все", () => {
    const { views } = positionFacets(items, scope);
    expect(views.verified + views.pending).toBe(views.active);
    expect(views.active + views.excluded).toBe(views.all);
  });

  test("этапы закупки — только у переданных в закупку", () => {
    // d: none, e: ordered; f и g проверены, но не переданы
    expect(positionFacets(items, scope).stages).toEqual({
      none: 1,
      requested: 0,
      offers: 0,
      supplier_selected: 0,
      ordered: 1,
      delivered: 0,
    });
  });

  test("можно подтвердить без правки и готовы к запросу", () => {
    const facets = positionFacets(items, scope);
    expect(facets.autoVerified).toBe(1); // a: непроверена, 0,9
    expect(facets.readyForRequest).toBe(1); // d: передана, этап none
  });

  test("сводка передачи: проверенные и ещё не переданные", () => {
    // f и g; у f нет наименования по справочнику и нет характеристик
    expect(positionFacets(items, scope).handOver).toEqual({
      count: 2,
      needNormalization: 1,
      withoutCharacteristics: 1,
    });
  });

  test("листы: активные позиции и непроверенные ниже порога автоподтверждения", () => {
    // sh-1: a b d g активны (i, j нет) → 4; внимания требует b (a уверена)
    // sh-2: c e f → 3; внимания требует c
    // sh-3: только исключённая h → 0 и 0, но лист в списке есть
    expect(bySheet(positionFacets(items, scope).sheets)).toEqual([
      { sheetId: "sh-1", total: 4, attention: 1 },
      { sheetId: "sh-2", total: 3, attention: 1 },
      { sheetId: "sh-3", total: 0, attention: 0 },
    ]);
  });

  test("разделы без фильтра вида считают активные позиции", () => {
    // G1: a b d f (h, i исключены) → 4, проверены d f → 2
    // G2: c e g (j — заголовок) → 3, проверены e g → 2
    expect(byGroup(positionFacets(items, scope).groups)).toEqual([
      { group: "G1", total: 4, verified: 2 },
      { group: "G2", total: 3, verified: 2 },
    ]);
  });

  test("разделы учитывают вид, но не выбранный раздел и лист", () => {
    const filter: PositionFilter = { ...scope, view: "verified", group: "G1", sheetId: "sh-1" };
    const facets = positionFacets(items, filter);
    // G1: d f; G2: e g — выбранный раздел и лист не сужают счётчики разделов
    expect(byGroup(facets.groups)).toEqual([
      { group: "G1", total: 2, verified: 2 },
      { group: "G2", total: 2, verified: 2 },
    ]);
    // виды и листы — по всей области, как без фильтра
    expect(facets.views.active).toBe(7);
    expect(facets.sheets).toHaveLength(3);
  });

  test("разделы учитывают этап закупки", () => {
    const facets = positionFacets(items, { ...scope, stage: "ordered" });
    expect(facets.groups).toEqual([{ group: "G2", total: 1, verified: 1 }]); // только e
  });

  test("разделы учитывают характеристики", () => {
    const facets = positionFacets(items, { ...scope, chars: "without" });
    // активные без характеристик: c (G2, не проверена), f (G1, проверена)
    expect(byGroup(facets.groups)).toEqual([
      { group: "G1", total: 1, verified: 1 },
      { group: "G2", total: 1, verified: 0 },
    ]);
  });

  test("позиции вне объекта и вне ревизии не считаются", () => {
    const facets = positionFacets(items, scope);
    expect(facets.views.all).toBe(10); // 12 позиций минус 2 вне области
  });

  test("без ревизии в фильтре считаются все ревизии объекта", () => {
    const facets = positionFacets(items, { projectId: "p-1" });
    expect(facets.views.all).toBe(11); // + old-revision
    expect(facets.views.pending).toBe(4);
  });

  test("порог 0,85 в счётчиках: ровно 0,85 — автоподтверждение, 0,8499 — внимание", () => {
    const facets = positionFacets(
      [
        position({ id: "x", confidence: 0.85 }),
        position({ id: "y", confidence: 0.8499 }),
        position({ id: "z", confidence: 0.7 }),
      ],
      {},
    );
    expect(facets.autoVerified).toBe(1);
    expect(facets.views.attention).toBe(2);
    expect(facets.views.check).toBe(0);
    expect(facets.sheets).toEqual([{ sheetId: "sh-1", total: 3, attention: 2 }]);
  });

  test("счётчики видов есть для каждого вида из positionViews", () => {
    const facets = positionFacets(items, scope);
    expect(Object.keys(facets.views).sort()).toEqual([...positionViews].sort());
  });
});
