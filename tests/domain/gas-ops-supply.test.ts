import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { createGasSupplyDemo } from "@/adapters/gas-ops/supply-demo";
import { getSnapshot, resetState } from "@/adapters/gas-ops/state";
import { buildSupplySeed } from "@/data/mock/gas-supply-seed";
import {
  acceptedMaterials,
  canMove,
  compareOffers,
  isOverdue,
  limitCheck,
  limitText,
  overLimits,
  parseNeedBy,
  parseRequestText,
  parseRubToKop,
  receiptOf,
  requestLimit,
  rfqText,
  siteRequests,
  sortRequests,
  supplyMetrics,
  supplyOverview,
  type Offer,
  type SupplyRequest,
} from "@/domain/gas-ops/supply";
import { SupplyError } from "@/ports/gas-supply";

/**
 * Снабжение v1 (ADR-057): статусы, разбор текста заявки, лимит сметы, сравнение предложений,
 * приёмка и права. Инварианты раздела 1.4 — по номерам в названиях тестов.
 */

const TODAY = "2026-10-28"; // среда
const items = buildSupplySeed(TODAY).items;

function request(over: Partial<SupplyRequest>): SupplyRequest {
  return {
    id: "r1",
    number: "ЗК-00010",
    objectId: "obj-m1",
    lines: [{ id: "l1", itemId: "nm-pipe-20", qty: 50 }],
    needBy: null,
    priority: "normal",
    photos: [],
    authorId: "u",
    authorName: "Прораб",
    clientKey: null,
    createdAt: `${TODAY}T08:00:00`,
    status: "new",
    rejectReason: null,
    chosenOfferId: null,
    eta: null,
    history: [],
    source: "mock",
    ...over,
  };
}

function offer(over: Partial<Offer>): Offer {
  return {
    id: "o1",
    requestId: "r1",
    supplierId: "sp-a",
    lines: [{ lineId: "l1", priceKop: 10_000 }],
    leadDays: 3,
    deliveryKop: 0,
    terms: null,
    fileName: null,
    enteredBy: "С",
    at: `${TODAY}T10:00:00`,
    ...over,
  };
}

describe("статусы заявки", () => {
  test("путь новая → закрыта и отклонение только до заказа", () => {
    expect(canMove("new", "in-work")).toBe(true);
    expect(canMove("in-work", "waiting-offers")).toBe(true);
    expect(canMove("waiting-offers", "ordered")).toBe(true);
    expect(canMove("ordered", "in-transit")).toBe(true);
    expect(canMove("in-transit", "partial")).toBe(true);
    expect(canMove("partial", "delivered")).toBe(true);
    expect(canMove("delivered", "closed")).toBe(true);
    expect(canMove("new", "ordered")).toBe(false);
    expect(canMove("ordered", "rejected")).toBe(false);
    expect(canMove("rejected", "in-work")).toBe(false);
    expect(canMove("closed", "in-work")).toBe(false);
  });

  test("просрочено к дате: срок прошёл, а не доставлено", () => {
    expect(isOverdue({ needBy: "2026-10-27", status: "ordered" }, TODAY)).toBe(true);
    expect(isOverdue({ needBy: "2026-10-27", status: "delivered" }, TODAY)).toBe(false);
    expect(isOverdue({ needBy: TODAY, status: "new" }, TODAY)).toBe(false);
    expect(isOverdue({ needBy: null, status: "new" }, TODAY)).toBe(false);
  });

  test("показатели и порядок: срочные, затем ближайший срок", () => {
    const list = [
      request({ id: "a", number: "ЗК-1", needBy: "2026-10-30" }),
      request({ id: "b", number: "ЗК-2", needBy: null, priority: "urgent" }),
      request({ id: "c", number: "ЗК-3", needBy: "2026-10-26", status: "waiting-offers" }),
      request({ id: "d", number: "ЗК-4", status: "in-transit" }),
    ];
    expect(sortRequests(list).map((r) => r.id)).toEqual(["b", "c", "a", "d"]);
    expect(supplyMetrics(list, TODAY)).toEqual({
      fresh: 2,
      waitingOffers: 1,
      inTransit: 1,
      overdue: 1,
    });
  });
});

describe("разбор текста заявки (инвариант 6: черновик, выбор из номенклатуры)", () => {
  test("позиции, количество и единица; размер не считается количеством", () => {
    const draft = parseRequestText("Труба вгп 20 мм 50 метров, краны газовые 4 шт", items, TODAY);
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0]).toMatchObject({ itemId: "nm-pipe-20", qty: 50, confidence: "high" });
    expect(draft.lines[1]).toMatchObject({ itemId: "nm-valve", qty: 4, confidence: "high" });
  });

  test("не угадывает: нет позиции или количества — низкая уверенность с пояснением", () => {
    const draft = parseRequestText("бетон 3 куба; подводка", items, TODAY);
    expect(draft.lines[0]).toMatchObject({ itemId: null, qty: 3, confidence: "low" });
    expect(draft.lines[0]!.note).toContain("не найдена");
    expect(draft.lines[1]).toMatchObject({ itemId: "nm-hose", qty: null, confidence: "low" });
  });

  test("размер в миллиметрах без синонима позиции не становится количеством", () => {
    const line = parseRequestText("кронштейн 600 мм 3 шт", items, TODAY).lines[0]!;
    expect(line).toMatchObject({ itemId: "nm-bracket", qty: 3, confidence: "high" });
  });

  test("единица не та, что у позиции, — отдельное подтверждение", () => {
    const line = parseRequestText("кран газовый 2 метра", items, TODAY).lines[0]!;
    expect(line.confidence).toBe("low");
    expect(line.note).toContain("«шт»");
  });

  test("срок и срочность из текста", () => {
    expect(parseNeedBy("к пятнице", TODAY)?.day).toBe("2026-10-30");
    expect(parseNeedBy("в среду", TODAY)?.day).toBe("2026-11-04");
    expect(parseNeedBy("завтра", TODAY)?.day).toBe("2026-10-29");
    expect(parseNeedBy("до 05.11", TODAY)?.day).toBe("2026-11-05");
    const draft = parseRequestText("срочно дымоход 1 комплект к пятнице", items, TODAY);
    expect(draft).toMatchObject({ urgent: true, needBy: "2026-10-30" });
    expect(draft.lines[0]).toMatchObject({ itemId: "nm-flue", qty: 1, confidence: "high" });
  });
});

describe("лимит по смете", () => {
  const limits = [{ objectId: "obj-m1", itemId: "nm-pipe-20", qty: 120, source: "mock" as const }];

  test("«по смете 120 м, заказано 80, в заявке 50: превышение 10»", () => {
    const ordered = request({
      id: "x",
      number: "ЗК-00001",
      status: "ordered",
      lines: [{ id: "q", itemId: "nm-pipe-20", qty: 80 }],
    });
    const check = limitCheck({
      objectId: "obj-m1",
      itemId: "nm-pipe-20",
      qty: 50,
      limits,
      requests: [ordered],
      requestId: "r1",
    });
    expect(check).toMatchObject({ limit: 120, ordered: 80, inRequest: 50, over: 10 });
    expect(limitText(check, "м")).toBe(
      "по смете 120\u00a0м, заказано 80, в заявке 50: превышение 10",
    );
  });

  test("неотправленные и отклонённые заявки «заказано» не увеличивают", () => {
    const fresh = request({ id: "x", status: "waiting-offers" });
    const rejected = request({ id: "y", status: "rejected" });
    expect(
      limitCheck({
        objectId: "obj-m1",
        itemId: "nm-pipe-20",
        qty: 50,
        limits,
        requests: [fresh, rejected],
      }).ordered,
    ).toBe(0);
  });

  test("нет лимита — null и честная метка, а не ноль (инвариант 8)", () => {
    const check = limitCheck({
      objectId: "obj-m2",
      itemId: "nm-pipe-20",
      qty: 5,
      limits,
      requests: [],
    });
    expect(check.limit).toBeNull();
    expect(limitText(check, "м")).toBe("Лимита по смете нет");
  });

  test("у ранней заказанной заявки поздний заказ не считается «заказано»", () => {
    const a = request({
      id: "a",
      number: "ЗК-00001",
      status: "partial",
      lines: [{ id: "a1", itemId: "nm-pipe-20", qty: 50 }],
    });
    const b = request({
      id: "b",
      number: "ЗК-00002",
      status: "ordered",
      lines: [{ id: "b1", itemId: "nm-pipe-20", qty: 90 }],
    });
    const fresh = request({
      id: "c",
      number: "ЗК-00003",
      status: "new",
      lines: [{ id: "c1", itemId: "nm-pipe-20", qty: 10 }],
    });
    const state = { requests: [a, b, fresh], limits };
    expect(requestLimit(state, a, "nm-pipe-20", 50)).toMatchObject({ ordered: 0, over: 0 });
    expect(requestLimit(state, b, "nm-pipe-20", 90)).toMatchObject({ ordered: 50, over: 20 });
    expect(requestLimit(state, fresh, "nm-pipe-20", 10)).toMatchObject({ ordered: 140, over: 30 });
  });

  test("превышение одной заказанной строки не повторяется у следующих заказанных", () => {
    const a = request({
      id: "a",
      number: "ЗК-00001",
      status: "ordered",
      lines: [{ id: "a1", itemId: "nm-pipe-20", qty: 80 }],
    });
    const b = request({
      id: "b",
      number: "ЗК-00002",
      status: "ordered",
      lines: [{ id: "b1", itemId: "nm-pipe-20", qty: 50 }],
    });
    expect(overLimits({ requests: [a, b], limits })).toEqual([
      { requestId: "b", number: "ЗК-00002", objectId: "obj-m1", itemId: "nm-pipe-20", over: 10 },
    ]);
  });
});

describe("сравнение предложений", () => {
  const r = request({
    lines: [
      { id: "l1", itemId: "nm-pipe-20", qty: 10 },
      { id: "l2", itemId: "nm-valve", qty: 2 },
    ],
  });

  test("итог со доставкой, лучшая цена и лучший срок отдельно", () => {
    const rows = compareOffers(r, [
      offer({
        id: "a",
        lines: [
          { lineId: "l1", priceKop: 20_000 },
          { lineId: "l2", priceKop: 50_000 },
        ],
        leadDays: 5,
        deliveryKop: 100_000,
      }),
      offer({
        id: "b",
        lines: [
          { lineId: "l1", priceKop: 25_000 },
          { lineId: "l2", priceKop: 55_000 },
        ],
        leadDays: 2,
        deliveryKop: 0,
      }),
    ]);
    expect(rows.map((x) => x.totalKop)).toEqual([400_000, 360_000]);
    expect(rows.map((x) => [x.bestPrice, x.bestLead])).toEqual([
      [false, false],
      [true, true],
    ]);
  });

  test("неполное предложение без итога и не может быть лучшим", () => {
    const rows = compareOffers(r, [
      offer({ id: "a", lines: [{ lineId: "l1", priceKop: 1 }], leadDays: 1 }),
      offer({
        id: "b",
        lines: [
          { lineId: "l1", priceKop: 25_000 },
          { lineId: "l2", priceKop: 55_000 },
        ],
        leadDays: 4,
      }),
    ]);
    expect(rows[0]).toMatchObject({ totalKop: null, bestPrice: false, bestLead: false });
    expect(rows[1]).toMatchObject({ bestPrice: true, bestLead: true });
  });

  test("цена с копейками", () => {
    expect(parseRubToKop("1 250,5")).toBe(125_050);
    expect(parseRubToKop("12.345")).toBeNull();
    expect(parseRubToKop("abc")).toBeNull();
  });
});

describe("приёмка", () => {
  const r = request({
    status: "in-transit",
    lines: [
      { id: "l1", itemId: "nm-pipe-20", qty: 50 },
      { id: "l2", itemId: "nm-valve", qty: 4 },
    ],
  });
  const base = { invoicePhoto: null, certificates: [] };

  test("всё совпало — «доставлено»", () => {
    const check = receiptOf(r, [], {
      ...base,
      lines: [
        { lineId: "l1", qty: 50 },
        { lineId: "l2", qty: 4 },
      ],
      withDiscrepancy: false,
      discrepancy: null,
    });
    expect(check).toMatchObject({ ok: true, status: "delivered", result: "accepted", diffs: [] });
  });

  test("расхождение без кнопки «с расхождением» и без описания не принимается", () => {
    const lines = [
      { lineId: "l1", qty: 45 },
      { lineId: "l2", qty: 4 },
    ];
    expect(
      receiptOf(r, [], { ...base, lines, withDiscrepancy: false, discrepancy: null }),
    ).toMatchObject({ ok: false, code: "discrepancy-required" });
    expect(
      receiptOf(r, [], { ...base, lines, withDiscrepancy: true, discrepancy: " " }),
    ).toMatchObject({ ok: false, code: "note-required" });
    const ok = receiptOf(r, [], {
      ...base,
      lines,
      withDiscrepancy: true,
      discrepancy: "Не довезли 5 м",
    });
    expect(ok).toMatchObject({ ok: true, status: "partial", result: "accepted-with-discrepancy" });
    if (ok.ok) expect(ok.diffs).toEqual([{ lineId: "l1", expected: 50, fact: 45, diff: -5 }]);
  });

  test("вторая приёмка дополняет частичную", () => {
    const first = {
      id: "rc1",
      requestId: "r1",
      lines: [
        { lineId: "l1", qty: 45 },
        { lineId: "l2", qty: 4 },
      ],
      result: "accepted-with-discrepancy" as const,
      discrepancy: "x",
      invoicePhoto: null,
      certificates: [],
      acceptedBy: "П",
      at: TODAY,
      clientKey: null,
    };
    const check = receiptOf(r, [first], {
      ...base,
      lines: [
        { lineId: "l1", qty: 5 },
        { lineId: "l2", qty: 0 },
      ],
      withDiscrepancy: false,
      discrepancy: null,
    });
    expect(check).toMatchObject({ ok: true, status: "delivered" });
  });
});

describe("через порт: права, идемпотентность, путь до ПТО", () => {
  const ops = createGasOpsDemo();
  const supply = createGasSupplyDemo();

  beforeEach(() => {
    resetState();
  });

  test("инвариант 4: повтор создания с тем же ключом не даёт дубль", async () => {
    await ops.signIn("u-prorab");
    const input = {
      objectId: "obj-m1",
      lines: [{ itemId: "nm-pipe-20", qty: "50" }],
      needBy: null,
      priority: "normal" as const,
      photos: [],
      clientKey: "k-1",
    };
    const a = await supply.createRequest(input);
    const b = await supply.createRequest(input);
    expect(b.id).toBe(a.id);
    expect(getSnapshot().supply.requests.filter((r) => r.clientKey === "k-1")).toHaveLength(1);
  });

  test("инвариант 5: прораб не создаёт заявку на чужой объект и не ведёт решения", async () => {
    await ops.signIn("u-prorab");
    const foreign = getSnapshot().objects.find((o) => o.source !== "mock")!.id;
    await expect(
      supply.createRequest({
        objectId: foreign,
        lines: [{ itemId: "nm-valve", qty: 1 }],
        needBy: null,
        priority: "normal",
        photos: [],
        clientKey: null,
      }),
    ).rejects.toBeInstanceOf(SupplyError);
    await expect(supply.moveRequest({ id: "zk-demo-1", to: "in-work" })).rejects.toMatchObject({
      code: "not-allowed",
    });
    await ops.signIn("u-director");
    await expect(supply.moveRequest({ id: "zk-demo-1", to: "in-work" })).rejects.toMatchObject({
      code: "not-allowed",
    });
  });

  test("переходы проверяет порт: нельзя заказать без выбранного предложения", async () => {
    await ops.signIn("u-supply");
    await supply.moveRequest({ id: "zk-demo-1", to: "in-work" });
    await expect(supply.markOrdered({ requestId: "zk-demo-1" })).rejects.toMatchObject({
      code: "bad-move",
    });
    await supply.moveRequest({ id: "zk-demo-1", to: "waiting-offers" });
    await expect(supply.markOrdered({ requestId: "zk-demo-1" })).rejects.toMatchObject({
      code: "no-offer",
    });
    await expect(supply.rejectRequest({ id: "zk-demo-1", reason: "" })).rejects.toMatchObject({
      code: "reason-required",
    });
  });

  test("путь: заявка → 2 предложения → заказано → приёмка с расхождением → материал у ПТО", async () => {
    await ops.signIn("u-prorab");
    const created = await supply.createRequest({
      objectId: "obj-m1",
      lines: [{ itemId: "nm-pipe-20", qty: 50 }],
      needBy: null,
      priority: "urgent",
      photos: ["фото.jpg"],
      clientKey: null,
    });
    const line = created.lines[0]!.id;

    await ops.signIn("u-supply");
    await supply.moveRequest({ id: created.id, to: "in-work" });
    await supply.moveRequest({ id: created.id, to: "waiting-offers" });
    const a = await supply.addOffer({
      requestId: created.id,
      supplierId: "sp-a",
      lines: [{ lineId: line, price: "210" }],
      leadDays: "5",
      delivery: "1500",
      terms: null,
      fileName: null,
    });
    await supply.addOffer({
      requestId: created.id,
      supplierId: "sp-b",
      lines: [{ lineId: line, price: "230" }],
      leadDays: "2",
      delivery: "",
      terms: null,
      fileName: "кп.pdf",
    });
    const rows = compareOffers(
      getSnapshot().supply.requests.find((r) => r.id === created.id)!,
      getSnapshot().supply.offers,
    );
    expect(rows.map((x) => x.totalKop)).toEqual([1_200_000, 1_150_000]);
    await supply.chooseOffer({ requestId: created.id, offerId: a.id });
    await supply.markOrdered({ requestId: created.id });
    await supply.markInTransit({ requestId: created.id, eta: "2026-11-02" });

    // Прораб не получает цен: в его выборке их нет
    const site = siteRequests(getSnapshot().supply, new Set(["obj-m1"]));
    expect(JSON.stringify(site)).not.toMatch(/price|Kop|offer/i);

    await ops.signIn("u-prorab");
    const receipt = await supply.acceptDelivery({
      requestId: created.id,
      lines: [{ lineId: line, qty: "48" }],
      withDiscrepancy: true,
      discrepancy: "Не довезли 2 м",
      invoicePhoto: "накладная.jpg",
      certificates: [{ lineId: line, fileName: "сертификат_ВГП20.pdf" }],
      clientKey: "rk-1",
    });
    // Повтор приёмки с тем же ключом — та же приёмка
    const again = await supply.acceptDelivery({
      requestId: created.id,
      lines: [{ lineId: line, qty: "48" }],
      withDiscrepancy: true,
      discrepancy: "Не довезли 2 м",
      invoicePhoto: null,
      certificates: [],
      clientKey: "rk-1",
    });
    expect(again.id).toBe(receipt.id);
    const snap = getSnapshot();
    expect(snap.supply.requests.find((r) => r.id === created.id)!.status).toBe("partial");

    const materials = acceptedMaterials(snap.supply);
    expect(materials).toHaveLength(1);
    expect(materials[0]).toMatchObject({
      itemId: "nm-pipe-20",
      qty: 48,
      certificates: ["сертификат_ВГП20.pdf"],
      result: "accepted-with-discrepancy",
    });

    const overview = supplyOverview(snap.supply, snap.today);
    expect(overview).toMatchObject({ orderedKop: 1_200_000, orderedCount: 1, unpricedCount: 0 });
  });

  test("текст запроса без отправки писем: номер, объект, позиции", () => {
    const text = rfqText(request({ needBy: "2026-11-02" }), { objectLabel: "ОБ-101", items });
    expect(text).toContain("ЗК-00010");
    expect(text).toContain("1. Труба стальная ВГП 20 мм: 50 м");
    expect(text).toContain("к 02.11.2026");
  });
});
