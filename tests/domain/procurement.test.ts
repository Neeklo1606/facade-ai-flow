import { describe, expect, test } from "bun:test";
import type {
  OfferLine,
  ProjectDecision,
  RequestLine,
  RequestStatus,
  SupplierOffer,
  SupplyRequest,
} from "@/contracts";
import {
  answeredCount,
  compareOffers,
  decisionFor,
  isActiveRequest,
  replyDue,
  rfqStatus,
  supplierDecision,
} from "@/domain/procurement";

/* ---------- Фабрики. Деньги — в копейках ---------- */

function item(id: string, qty: number, name = `Материал ${id}`, unit = "шт"): RequestLine {
  return { id, materialId: null, name, qty, unit };
}

function request(overrides: Partial<SupplyRequest> = {}): SupplyRequest {
  return {
    id: "sr-1",
    number: "З-2026/318",
    projectId: "p-1",
    zoneId: null,
    authorId: "e-1",
    createdAt: "2026-09-01T10:00:00",
    sentAt: "2026-09-01T10:05:00",
    replyDueAt: "2026-09-04T18:00:00",
    templateId: null,
    status: "sent",
    sourceId: null,
    items: [],
    sentTo: [],
    ...overrides,
  };
}

function offer(
  overrides: Partial<SupplierOffer> & Pick<SupplierOffer, "id" | "supplierId">,
): SupplierOffer {
  return {
    requestId: "sr-1",
    receivedAt: "2026-09-03T12:00:00",
    deliveryCost: 0,
    vatPct: 20,
    validUntil: null,
    confidence: 0.9,
    sourceId: null,
    ...overrides,
  };
}

function offerLine(
  overrides: Partial<OfferLine> & Pick<OfferLine, "offerId" | "requestLineId" | "price">,
): OfferLine {
  return {
    id: `${overrides.offerId}-${overrides.requestLineId}`,
    name: "Как назвал поставщик",
    availableQty: 1_000_000,
    leadTimeDays: 7,
    deviation: null,
    sourceId: null,
    location: "абзац 1",
    ...overrides,
  };
}

function decision(overrides: Partial<ProjectDecision> & Pick<ProjectDecision, "id">) {
  const base: ProjectDecision = {
    id: overrides.id,
    projectId: "p-1",
    kind: "supplier",
    requestId: null,
    supplierId: null,
    reportId: null,
    materialFamily: null,
    title: "Решение",
    requirement: "Требование",
    problem: "Проблема",
    options: ["Вариант"],
    choice: "Выбор",
    reason: "Причина",
    approvedBy: "e-1",
    approvedAt: "2026-09-05T10:00:00",
    basisLabel: "Основание",
    basisSourceId: null,
    link: null,
  };
  return { ...base, ...overrides };
}

/* ---------- Ответы и решения ---------- */

describe("answeredCount", () => {
  const req = request({ sentTo: ["A", "B", "C"] });

  test("никто не ответил — 0", () => {
    expect(answeredCount([], req)).toBe(0);
  });

  test("ответили двое из трёх", () => {
    const offers = [
      { requestId: "sr-1", supplierId: "A" },
      { requestId: "sr-1", supplierId: "C" },
    ];
    expect(answeredCount(offers, req)).toBe(2);
  });

  test("ответили все", () => {
    const offers = ["A", "B", "C"].map((supplierId) => ({ requestId: "sr-1", supplierId }));
    expect(answeredCount(offers, req)).toBe(3);
  });

  test("предложение по другому запросу не считается", () => {
    expect(answeredCount([{ requestId: "sr-2", supplierId: "A" }], req)).toBe(0);
  });

  test("поставщик вне получателей запроса не считается", () => {
    expect(answeredCount([{ requestId: "sr-1", supplierId: "Z" }], req)).toBe(0);
  });

  test("два предложения одного поставщика — один ответивший", () => {
    const offers = [
      { requestId: "sr-1", supplierId: "A" },
      { requestId: "sr-1", supplierId: "A" },
    ];
    expect(answeredCount(offers, req)).toBe(1);
  });

  test("запрос без получателей — 0", () => {
    expect(answeredCount([{ requestId: "sr-1", supplierId: "A" }], request())).toBe(0);
  });
});

describe("decisionFor", () => {
  const decisions = [
    decision({ id: "d-1", requestId: "sr-1" }),
    decision({ id: "d-2", requestId: "sr-2" }),
  ];

  test("решение по запросу найдено", () => {
    expect(decisionFor(decisions, "sr-2")?.id).toBe("d-2");
  });

  test("решения нет — null", () => {
    expect(decisionFor(decisions, "sr-3")).toBeNull();
  });

  test("пустой список — null", () => {
    expect(decisionFor([], "sr-1")).toBeNull();
  });

  test("решение без запроса (замена материала) по запросу не находится", () => {
    const list = [decision({ id: "d-9", kind: "replacement", requestId: null })];
    expect(decisionFor(list, "sr-1")).toBeNull();
  });
});

describe("isActiveRequest", () => {
  const cases: [RequestStatus, boolean][] = [
    ["draft", false],
    ["sent", true],
    ["decided", true],
    ["ordered", false],
    ["cancelled", false],
  ];
  for (const [status, active] of cases) {
    test(`${status} — ${active ? "активный" : "не активный"}`, () => {
      expect(isActiveRequest({ status })).toBe(active);
    });
  }
});

/* ---------- Статус запроса на экране ---------- */

describe("rfqStatus", () => {
  const DUE = "2026-09-04T18:00:00";
  const BEFORE = "2026-09-04T12:00:00";
  const req = request({ sentTo: ["A", "B"], replyDueAt: DUE });

  test("отправлен, никто не ответил, срок не прошёл — «отправлен»", () => {
    expect(rfqStatus(req, 0, false, BEFORE)).toBe("sent");
  });

  test("ответила часть, срок не прошёл — «собираем ответы»", () => {
    expect(rfqStatus(req, 1, false, BEFORE)).toBe("collecting");
  });

  test("ответили все — «готово к сравнению»", () => {
    expect(rfqStatus(req, 2, false, BEFORE)).toBe("ready");
  });

  test("ответили все после срока — «готово», а не просрочен: просрочен, только если ответили не все", () => {
    expect(rfqStatus(req, 2, false, "2026-09-10T12:00:00")).toBe("ready");
  });

  test("срок прошёл, никто не ответил — просрочен", () => {
    expect(rfqStatus(req, 0, false, "2026-09-05T09:00:00")).toBe("overdue");
  });

  test("срок прошёл, ответила часть — всё равно просрочен", () => {
    expect(rfqStatus(req, 1, false, "2026-09-05T09:00:00")).toBe("overdue");
  });

  test("просрочен на одну минуту", () => {
    expect(rfqStatus(req, 1, false, "2026-09-04T18:01:00")).toBe("overdue");
  });

  test("ровно в срок — ещё не просрочен (строго меньше текущего времени)", () => {
    expect(rfqStatus(req, 0, false, DUE)).toBe("sent");
    expect(rfqStatus(req, 1, false, DUE)).toBe("collecting");
  });

  test("за минуту до срока — не просрочен", () => {
    expect(rfqStatus(req, 1, false, "2026-09-04T17:59:00")).toBe("collecting");
  });

  test("срока ответа нет — не просрочивается", () => {
    const noDue = request({ sentTo: ["A", "B"], replyDueAt: null });
    expect(rfqStatus(noDue, 0, false, "2030-01-01T00:00:00")).toBe("sent");
    expect(rfqStatus(noDue, 1, false, "2030-01-01T00:00:00")).toBe("collecting");
  });

  test("срок и текущее время в разных часовых поясах сравниваются как моменты", () => {
    // 18:00 +03:00 = 15:00Z; сейчас 15:30Z — срок прошёл полчаса назад
    const tz = request({ sentTo: ["A", "B"], replyDueAt: "2026-09-04T18:00:00+03:00" });
    expect(rfqStatus(tz, 1, false, "2026-09-04T15:30:00Z")).toBe("overdue");
  });

  test("решение зафиксировано — «решение принято», даже если срок прошёл", () => {
    expect(rfqStatus(req, 1, true, "2026-09-10T12:00:00")).toBe("decided");
    expect(rfqStatus(req, 2, true, BEFORE)).toBe("decided");
  });

  test("хранимый статус decided — «решение принято» без флага", () => {
    expect(rfqStatus(request({ ...req, status: "decided" }), 0, false, BEFORE)).toBe("decided");
  });

  test("заказан — «заказано», важнее решения", () => {
    expect(rfqStatus(request({ ...req, status: "ordered" }), 2, true, BEFORE)).toBe("ordered");
  });

  test("без получателей и без ответов — не «готово»", () => {
    const empty = request({ sentTo: [], replyDueAt: null });
    expect(rfqStatus(empty, 0, false, BEFORE)).toBe("sent");
  });
});

describe("replyDue", () => {
  const req = request({ replyDueAt: "2026-09-04T18:00:00" });

  test("до срока 6 часов — осталось 6 ч", () => {
    expect(replyDue(req, "sent", "2026-09-04T12:00:00")).toEqual({ hours: 6, overdue: false });
    expect(replyDue(req, "collecting", "2026-09-04T12:00:00")).toEqual({
      hours: 6,
      overdue: false,
    });
  });

  test("ровно в срок — 0 часов, не просрочено", () => {
    expect(replyDue(req, "sent", "2026-09-04T18:00:00")).toEqual({ hours: 0, overdue: false });
  });

  test("просрочено на 26 часов — отрицательное значение", () => {
    // 18:00 4-го → 20:00 5-го = 26 ч
    expect(replyDue(req, "overdue", "2026-09-05T20:00:00")).toEqual({
      hours: -26,
      overdue: true,
    });
  });

  test("просрочено на минуту — меньше часа округляется к нулю, признак просрочки есть", () => {
    const due = replyDue(req, "overdue", "2026-09-04T18:01:00");
    expect(due?.overdue).toBe(true);
    // −1/60 ч округляется до 0 (знак нуля не важен: экран берёт модуль)
    expect(Math.abs(due?.hours ?? Number.NaN)).toBe(0);
  });

  test("готово к сравнению, решено, заказано — срока нет", () => {
    for (const status of ["ready", "decided", "ordered"] as const) {
      expect(replyDue(req, status, "2026-09-04T12:00:00")).toBeNull();
    }
  });

  test("у запроса нет срока ответа — null", () => {
    const noDue = request({ replyDueAt: null });
    expect(replyDue(noDue, "sent", "2026-09-04T12:00:00")).toBeNull();
  });
});

/* ---------- Сравнение предложений ---------- */

describe("compareOffers", () => {
  // Запрос: L1 — 100 шт, L2 — 50 м; получатели A, B, C
  const req = request({ items: [item("L1", 100), item("L2", 50, "Направляющая", "м")] });
  const reqABC = { ...req, sentTo: ["A", "B", "C"] };

  // A: полное предложение, доставка 30 000, НДС 20 %
  const offerA = offer({ id: "o-A", supplierId: "A", deliveryCost: 30_000, sourceId: "src-A" });
  const linesA = [
    offerLine({ offerId: "o-A", requestLineId: "L1", price: 1_000, leadTimeDays: 10 }),
    offerLine({
      offerId: "o-A",
      requestLineId: "L2",
      price: 2_000,
      leadTimeDays: 14,
      availableQty: 40,
    }),
  ];
  // B: только L1 — «предложены не все позиции», без доставки
  const offerB = offer({ id: "o-B", supplierId: "B" });
  const linesB = [offerLine({ offerId: "o-B", requestLineId: "L1", price: 900 })];

  test("итог полного предложения: товар + доставка + НДС на эту сумму", () => {
    const { columns } = compareOffers(
      { offers: [offerA, offerB], offerLines: [...linesA, ...linesB] },
      reqABC,
    );
    const a = columns[0];
    // товар: 1 000 × 100 + 2 000 × 50 = 100 000 + 100 000 = 200 000
    // без НДС: 200 000 + 30 000 = 230 000; НДС 20 %: 46 000; итог 276 000
    expect(a).toMatchObject({
      supplierId: "A",
      offerId: "o-A",
      goods: 200_000,
      deliveryCost: 30_000,
      vatPct: 20,
      subtotal: 230_000,
      vat: 46_000,
      total: 276_000,
      complete: true,
    });
  });

  test("ячейки: доставка пропорционально сумме строки, НДС на строку с доставкой", () => {
    const { columns } = compareOffers({ offers: [offerA], offerLines: linesA }, reqABC);
    const cells = columns[0]?.cells ?? {};
    // суммы строк равны (100 000 и 100 000) → доставка пополам: 15 000 и 15 000
    // НДС строки: (100 000 + 15 000) × 20 % = 23 000; итог строки 138 000
    expect(cells["L1"]).toMatchObject({
      price: 1_000,
      qty: 100,
      amount: 100_000,
      delivery: 15_000,
      vat: 23_000,
      total: 138_000,
      leadTimeDays: 10,
    });
    expect(cells["L2"]).toMatchObject({
      price: 2_000,
      qty: 50,
      amount: 100_000,
      delivery: 15_000,
      vat: 23_000,
      total: 138_000,
      leadTimeDays: 14,
    });
  });

  test("доставка при неравных суммах: 3 : 1", () => {
    const r = request({ items: [item("L1", 30), item("L2", 10)], sentTo: ["A"] });
    const o = offer({ id: "o", supplierId: "A", deliveryCost: 4_000, vatPct: 0 });
    const lines = [
      offerLine({ offerId: "o", requestLineId: "L1", price: 100 }),
      offerLine({ offerId: "o", requestLineId: "L2", price: 100 }),
    ];
    const cells = compareOffers({ offers: [o], offerLines: lines }, r).columns[0]?.cells ?? {};
    // суммы 3 000 и 1 000 → доставка 4 000 × 3/4 = 3 000 и 4 000 × 1/4 = 1 000
    expect(cells["L1"]?.delivery).toBe(3_000);
    expect(cells["L2"]?.delivery).toBe(1_000);
  });

  test("доставка, распределённая по строкам, в сумме равна доставке предложения", () => {
    // три равные строки по 1 000, доставка 100 копеек: 100 / 3 не делится нацело
    const r = request({
      items: [item("L1", 1), item("L2", 1), item("L3", 1)],
      sentTo: ["A"],
    });
    const o = offer({ id: "o", supplierId: "A", deliveryCost: 100, vatPct: 0 });
    const lines = ["L1", "L2", "L3"].map((id) =>
      offerLine({ offerId: "o", requestLineId: id, price: 1_000 }),
    );
    const column = compareOffers({ offers: [o], offerLines: lines }, r).columns[0];
    const cells = Object.values(column?.cells ?? {});
    expect(cells).toHaveLength(3);
    // доли по 33⅓ копейки: каждая 33 или 34, вместе ровно 100
    for (const cell of cells) expect([33, 34]).toContain(cell.delivery);
    expect(cells.reduce((acc, c) => acc + c.delivery, 0)).toBe(100);
    // итог колонки: 3 000 + 100 = 3 100
    expect(column?.total).toBe(3_100);
  });

  test("округление до копейки на строке: 12,5 м² × 999,99 ₽", () => {
    const r = request({ items: [item("L1", 12.5, "Панель", "м²")], sentTo: ["A"] });
    const o = offer({ id: "o", supplierId: "A", deliveryCost: 0, vatPct: 20 });
    const lines = [offerLine({ offerId: "o", requestLineId: "L1", price: 99_999 })];
    const column = compareOffers({ offers: [o], offerLines: lines }, r).columns[0];
    // 99 999 × 12,5 = 1 249 987,5 → 1 249 988
    expect(column?.cells["L1"]?.amount).toBe(1_249_988);
    expect(column?.goods).toBe(1_249_988);
    // НДС: 1 249 988 × 0,2 = 249 997,6 → 249 998; итог 1 499 986
    expect(column?.vat).toBe(249_998);
    expect(column?.total).toBe(1_499_986);
  });

  test("НДС 0 % — итог равен товару с доставкой", () => {
    const o = offer({ id: "o-A", supplierId: "A", deliveryCost: 30_000, vatPct: 0 });
    const column = compareOffers({ offers: [o], offerLines: linesA }, reqABC).columns[0];
    // 200 000 + 30 000 = 230 000
    expect(column).toMatchObject({ subtotal: 230_000, vat: 0, total: 230_000 });
    expect(column?.cells["L1"]?.vat).toBe(0);
  });

  test("без доставки — доставка строк 0", () => {
    const o = offer({ id: "o-A", supplierId: "A", deliveryCost: 0 });
    const column = compareOffers({ offers: [o], offerLines: linesA }, reqABC).columns[0];
    expect(column?.cells["L1"]?.delivery).toBe(0);
    expect(column?.cells["L2"]?.delivery).toBe(0);
    // 200 000 + НДС 40 000 = 240 000
    expect(column?.total).toBe(240_000);
  });

  test("предложены не все позиции: колонка неполная, итог только по предложенным", () => {
    const { columns } = compareOffers({ offers: [offerB], offerLines: linesB }, reqABC);
    const b = columns[1];
    // 900 × 100 = 90 000; НДС 18 000; итог 108 000
    expect(b).toMatchObject({
      supplierId: "B",
      goods: 90_000,
      subtotal: 90_000,
      vat: 18_000,
      total: 108_000,
      complete: false,
    });
    expect(Object.keys(b?.cells ?? {})).toEqual(["L1"]);
    expect(b?.cells["L2"]).toBeUndefined();
  });

  test("неполное предложение с доставкой: вся доставка ложится на предложенные строки", () => {
    const o = offer({ id: "o-B", supplierId: "B", deliveryCost: 5_000 });
    const cells =
      compareOffers({ offers: [o], offerLines: linesB }, reqABC).columns[1]?.cells ?? {};
    // единственная строка: доставка 5 000 целиком; НДС (90 000 + 5 000) × 0,2 = 19 000
    expect(cells["L1"]).toMatchObject({ delivery: 5_000, vat: 19_000, total: 114_000 });
  });

  test("поставщик не ответил — пустая колонка", () => {
    const { columns } = compareOffers({ offers: [offerA], offerLines: linesA }, reqABC);
    expect(columns[2]).toMatchObject({
      supplierId: "C",
      offerId: null,
      receivedAt: null,
      cells: {},
      goods: 0,
      total: 0,
      complete: false,
      deviations: 0,
      maxLeadTime: 0,
    });
  });

  test("колонки идут в порядке получателей", () => {
    const { columns } = compareOffers(
      { offers: [offerB, offerA], offerLines: [...linesB, ...linesA] },
      reqABC,
    );
    expect(columns.map((c) => c.supplierId)).toEqual(["A", "B", "C"]);
  });

  test("предложение того же поставщика по другому запросу не попадает в сравнение", () => {
    const other = offer({ id: "o-X", supplierId: "A", requestId: "sr-2", deliveryCost: 1 });
    const otherLines = [offerLine({ offerId: "o-X", requestLineId: "L1", price: 1 })];
    const result = compareOffers(
      { offers: [other, offerA], offerLines: [...otherLines, ...linesA] },
      reqABC,
    );
    expect(result.columns[0]?.offerId).toBe("o-A");
    expect(result.columns[0]?.total).toBe(276_000);
  });

  test("строка предложения на чужую строку запроса игнорируется", () => {
    const extra = offerLine({ offerId: "o-A", requestLineId: "L9", price: 999_999 });
    const column = compareOffers({ offers: [offerA], offerLines: [...linesA, extra] }, reqABC)
      .columns[0];
    expect(column?.goods).toBe(200_000);
    expect(column?.cells["L9"]).toBeUndefined();
    expect(column?.complete).toBe(true);
  });

  test("нехватка: доступно меньше нужного на единицу — есть, ровно столько — нет", () => {
    const lines = [
      offerLine({ offerId: "o-A", requestLineId: "L1", price: 1_000, availableQty: 99 }),
      offerLine({ offerId: "o-A", requestLineId: "L2", price: 2_000, availableQty: 50 }),
    ];
    const column = compareOffers({ offers: [offerA], offerLines: lines }, reqABC).columns[0];
    expect(column?.cells["L1"]?.shortage).toBe(true);
    expect(column?.cells["L2"]?.shortage).toBe(false);
    expect(column?.deviations).toBe(1);
  });

  test("отклонения: ячейка с отклонением и нехваткой считается один раз", () => {
    const lines = [
      offerLine({
        offerId: "o-A",
        requestLineId: "L1",
        price: 1_000,
        availableQty: 10,
        deviation: "Аналог, толщина 1,8 мм",
      }),
      offerLine({ offerId: "o-A", requestLineId: "L2", price: 2_000, deviation: "Другой сплав" }),
    ];
    const column = compareOffers({ offers: [offerA], offerLines: lines }, reqABC).columns[0];
    // L1: отклонение + нехватка → 1; L2: отклонение → 1; всего 2
    expect(column?.deviations).toBe(2);
  });

  test("наибольший срок поставки по строкам", () => {
    const column = compareOffers({ offers: [offerA], offerLines: linesA }, reqABC).columns[0];
    expect(column?.maxLeadTime).toBe(14);
  });

  test("источник ячейки: письмо строки, иначе письмо предложения", () => {
    const lines = [
      offerLine({ offerId: "o-A", requestLineId: "L1", price: 1_000, sourceId: "src-line" }),
      offerLine({ offerId: "o-A", requestLineId: "L2", price: 2_000, sourceId: null }),
    ];
    const cells = compareOffers({ offers: [offerA], offerLines: lines }, reqABC).columns[0]?.cells;
    expect(cells?.["L1"]?.sourceId).toBe("src-line");
    expect(cells?.["L2"]?.sourceId).toBe("src-A");
  });

  test("предложение без строк: товар 0, итог — доставка с НДС, неполное", () => {
    const o = offer({ id: "o-A", supplierId: "A", deliveryCost: 10_000 });
    const column = compareOffers({ offers: [o], offerLines: [] }, reqABC).columns[0];
    // 0 + 10 000 + НДС 2 000 = 12 000
    expect(column).toMatchObject({ goods: 0, subtotal: 10_000, total: 12_000, complete: false });
    expect(column?.maxLeadTime).toBe(0);
  });

  describe("лучшее предложение", () => {
    test("полное дороже неполного — лучшим считается полное", () => {
      const result = compareOffers(
        { offers: [offerA, offerB], offerLines: [...linesA, ...linesB] },
        reqABC,
      );
      // A 276 000 (полное) против B 108 000 (только L1)
      expect(result.answered).toBe(2);
      expect(result.bestSupplierId).toBe("A");
    });

    test("из двух полных — с наименьшим итогом", () => {
      const offerD = offer({ id: "o-D", supplierId: "B" });
      const linesD = [
        offerLine({ offerId: "o-D", requestLineId: "L1", price: 1_100 }),
        offerLine({ offerId: "o-D", requestLineId: "L2", price: 1_900 }),
      ];
      const result = compareOffers(
        { offers: [offerA, offerD], offerLines: [...linesA, ...linesD] },
        reqABC,
      );
      // B: 110 000 + 95 000 = 205 000, НДС 41 000 → 246 000 < 276 000 у A
      expect(result.columns[1]?.total).toBe(246_000);
      expect(result.bestSupplierId).toBe("B");
    });

    test("полных нет — лучшее среди всех ответивших", () => {
      const offerP = offer({ id: "o-P", supplierId: "A" });
      const linesP = [offerLine({ offerId: "o-P", requestLineId: "L1", price: 1_000 })];
      const offerQ = offer({ id: "o-Q", supplierId: "C", deliveryCost: 5_000 });
      const linesQ = [offerLine({ offerId: "o-Q", requestLineId: "L2", price: 1_500 })];
      const result = compareOffers(
        { offers: [offerP, offerQ], offerLines: [...linesP, ...linesQ] },
        reqABC,
      );
      // A: 100 000 + НДС 20 000 = 120 000; C: 75 000 + 5 000 = 80 000 + НДС 16 000 = 96 000
      expect(result.columns[0]?.total).toBe(120_000);
      expect(result.columns[2]?.total).toBe(96_000);
      expect(result.bestSupplierId).toBe("C");
    });

    test("единственное полное предложение — лучшее", () => {
      const result = compareOffers({ offers: [offerA], offerLines: linesA }, reqABC);
      expect(result.answered).toBe(1);
      expect(result.bestSupplierId).toBe("A");
    });

    test("никто не ответил — лучшего нет", () => {
      const result = compareOffers({ offers: [], offerLines: [] }, reqABC);
      expect(result.answered).toBe(0);
      expect(result.bestSupplierId).toBeNull();
      expect(result.columns).toHaveLength(3);
    });

    test("запрос без получателей — ни колонок, ни лучшего", () => {
      const result = compareOffers({ offers: [offerA], offerLines: linesA }, req);
      expect(result.columns).toEqual([]);
      expect(result.answered).toBe(0);
      expect(result.bestSupplierId).toBeNull();
    });
  });
});

/* ---------- Решение «выбор поставщика» ---------- */

describe("supplierDecision", () => {
  // Суммы малые, чтобы в тексте не было разделителя разрядов
  const req = request({
    id: "sr-1",
    number: "З-2026/318",
    projectId: "p-korona",
    items: [
      item("L1", 10, "Кронштейн", "шт"),
      item("L2", 5, "Направляющая", "м"),
      item("L3", 20, "Анкер", "шт"),
    ],
    sentTo: ["A", "B", "C"],
  });
  // A: полное; 10 × 100 + 5 × 200 + 20 × 50 = 3 000; доставка 1 000; НДС 800 → 4 800 = 48 ₽
  const offerA = offer({ id: "o-A", supplierId: "A", deliveryCost: 1_000, sourceId: "src-A" });
  const linesA = [
    offerLine({ offerId: "o-A", requestLineId: "L1", price: 100, leadTimeDays: 7 }),
    offerLine({ offerId: "o-A", requestLineId: "L2", price: 200, leadTimeDays: 12 }),
    offerLine({ offerId: "o-A", requestLineId: "L3", price: 50, leadTimeDays: 3 }),
  ];
  // B: только L1 с отклонением; 10 × 80 = 800; НДС 160 → 960 = 9,60 ₽
  const offerB = offer({ id: "o-B", supplierId: "B", sourceId: "src-B" });
  const linesB = [
    offerLine({
      offerId: "o-B",
      requestLineId: "L1",
      price: 80,
      leadTimeDays: 5,
      deviation: "Аналог",
    }),
  ];
  const names: Record<string, string> = { A: "ФасадКомплект", B: "МеталлПрофиль", C: "СтройКом" };
  const supplierName = (id: string) => names[id] ?? id;
  const comparison = compareOffers(
    { offers: [offerA, offerB], offerLines: [...linesA, ...linesB] },
    req,
  );

  function decide(supplierId: string, r: SupplyRequest = req, c = comparison) {
    return supplierDecision({
      request: r,
      comparison: c,
      supplierId,
      reason: "Полный объём, срок устраивает",
      approvedBy: "e-dorohov",
      supplierName,
    });
  }

  test("поля решения собраны из запроса и сравнения", () => {
    expect(decide("A")).toEqual({
      projectId: "p-korona",
      kind: "supplier",
      requestId: "sr-1",
      supplierId: "A",
      reportId: null,
      materialFamily: null,
      title: "Кронштейн, Направляющая и ещё 1 — «ФасадКомплект»",
      requirement: "Кронштейн — 10 шт; Направляющая — 5 м; Анкер — 20 шт",
      problem:
        "Получено 2 предложения из 3; цены и сроки различаются, есть отклонения от спецификации",
      options: [
        "«ФасадКомплект» — 48 ₽ с НДС и доставкой, до 12 дн.",
        "«МеталлПрофиль» — 9,60 ₽ с НДС и доставкой, до 5 дн., отклонений: 1",
      ],
      choice: "«ФасадКомплект», 48 ₽",
      reason: "Полный объём, срок устраивает",
      approvedBy: "e-dorohov",
      basisLabel: "Письма поставщиков по запросу З-2026/318",
      basisSourceId: "src-A",
    });
  });

  test("выбор неполного предложения: сумма с копейками", () => {
    const result = decide("B");
    expect(result.choice).toBe("«МеталлПрофиль», 9,60 ₽");
    expect(result.title).toBe("Кронштейн, Направляющая и ещё 1 — «МеталлПрофиль»");
    expect(result.basisSourceId).toBe("src-B");
  });

  test("не ответивший поставщик — ошибка", () => {
    expect(() => decide("C")).toThrow("Поставщик не прислал предложение по запросу");
  });

  test("поставщик вне получателей — ошибка", () => {
    expect(() => decide("Z")).toThrow("Поставщик не прислал предложение по запросу");
  });

  test("заголовок: одна строка — без «и ещё»", () => {
    const r = request({ items: [item("L1", 10, "Кронштейн")], sentTo: ["A"] });
    const c = compareOffers({ offers: [offerA], offerLines: linesA }, r);
    expect(decide("A", r, c).title).toBe("Кронштейн — «ФасадКомплект»");
  });

  test("заголовок: две строки — обе по имени, без «и ещё»", () => {
    const r = request({
      items: [item("L1", 10, "Кронштейн"), item("L2", 5, "Направляющая", "м")],
      sentTo: ["A"],
    });
    const c = compareOffers({ offers: [offerA], offerLines: linesA }, r);
    expect(decide("A", r, c).title).toBe("Кронштейн, Направляющая — «ФасадКомплект»");
  });

  test("без отклонений — без упоминания отклонений", () => {
    const r = { ...req, sentTo: ["A", "C"] };
    const c = compareOffers({ offers: [offerA], offerLines: linesA }, r);
    const result = decide("A", r, c);
    expect(result.problem).toStartWith("Получено 1 предложение из 2");
    expect(result.problem).not.toContain("отклонения");
    expect(result.options).toEqual(["«ФасадКомплект» — 48 ₽ с НДС и доставкой, до 12 дн."]);
  });

  test("пять предложений — «Получено 5 предложений из 5»", () => {
    const ids = ["A", "B", "C", "D", "E"];
    const r = { ...req, sentTo: ids };
    const offers = ids.map((id) => offer({ id: `o-${id}`, supplierId: id }));
    const lines = ids.map((id) =>
      offerLine({ offerId: `o-${id}`, requestLineId: "L1", price: 100 }),
    );
    const c = compareOffers({ offers, offerLines: lines }, r);
    expect(decide("A", r, c).problem).toStartWith("Получено 5 предложений из 5");
  });

  test("основание без источника у первой ячейки и у предложения — null", () => {
    const o = offer({ id: "o-A", supplierId: "A", sourceId: null });
    const c = compareOffers({ offers: [o], offerLines: linesA }, req);
    expect(decide("A", req, c).basisSourceId).toBeNull();
  });
});
