import { describe, expect, test } from "bun:test";
import type {
  Crew,
  Delivery,
  DeliveryRemark,
  ExtractedPosition,
  FieldReport,
  Project,
  ProjectDecision,
  ProjectDocument,
  RevisionChange,
  SupplierOffer,
  SupplyRequest,
} from "@/contracts";
import {
  currentRevisions,
  mainSpecification,
  projectOverview,
  revisionStats,
  revisionsOf,
  type OverviewSource,
} from "@/domain/overview";

/* ---------- Фабрики ---------- */

function revision(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: "rev-1",
    documentId: "doc-spec",
    revision: 1,
    projectId: "p-1",
    title: "Спецификация НВФ",
    section: "НВФ",
    version: "Рев. 1",
    fileName: "spec.pdf",
    fileType: "pdf",
    sizeKb: 1000,
    uploadedAt: "2026-08-01T10:00:00",
    uploadedBy: "e-volkova",
    sheetCount: 12,
    status: "review",
    sourceId: null,
    positionsTotal: null,
    positionsVerified: null,
    ...overrides,
  };
}

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
    projectName: "Кронштейн",
    materialId: "mat-1",
    normalizedName: "Кронштейн КН-1",
    characteristics: [],
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

/** Проверенная и переданная в закупку позиция */
function purchased(overrides: Partial<ExtractedPosition> = {}): ExtractedPosition {
  return position({
    review: "confirmed",
    reviewedBy: "e-volkova",
    reviewedAt: "2026-08-28T10:00:00",
    handedOverAt: "2026-08-29T10:00:00",
    ...overrides,
  });
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    name: "ЖК «Северная Корона»",
    code: "СК-3",
    region: "Москва",
    stage: "Монтаж фасада, этап 1",
    status: "active",
    startDate: "2026-05-12",
    endDate: "2027-03-31",
    customerId: "c-1",
    customer: "СтройИнвест",
    contractId: null,
    contract: "",
    manager: "e-sokolov",
    ...overrides,
  };
}

function request(overrides: Partial<SupplyRequest> = {}): SupplyRequest {
  return {
    id: "sr-1",
    number: "З-2026/301",
    projectId: "p-1",
    zoneId: null,
    authorId: "e-dorohov",
    createdAt: "2026-09-01T10:00:00",
    sentAt: "2026-09-01T11:00:00",
    replyDueAt: "2026-09-10T18:00:00",
    templateId: null,
    status: "sent",
    sourceId: null,
    items: [],
    sentTo: ["s-a", "s-b"],
    ...overrides,
  };
}

function offer(overrides: Partial<SupplierOffer> = {}): SupplierOffer {
  return {
    id: "of-1",
    requestId: "sr-1",
    supplierId: "s-a",
    receivedAt: "2026-09-02T10:00:00",
    deliveryCost: 0,
    vatPct: 20,
    validUntil: null,
    confidence: 0.95,
    sourceId: null,
    ...overrides,
  };
}

function decision(overrides: Partial<ProjectDecision> = {}): ProjectDecision {
  return {
    id: "dc-1",
    projectId: "p-1",
    kind: "supplier",
    requestId: "sr-1",
    supplierId: "s-a",
    reportId: null,
    materialFamily: null,
    title: "Выбран поставщик",
    requirement: "Цена и срок",
    problem: "Два предложения",
    options: ["s-a", "s-b"],
    choice: "s-a",
    reason: "Дешевле",
    approvedBy: "e-sokolov",
    approvedAt: "2026-09-05T10:00:00",
    basisLabel: "Счёт № 1",
    basisSourceId: null,
    link: null,
    ...overrides,
  };
}

function crew(overrides: Partial<Crew> = {}): Crew {
  return {
    id: "cr-1",
    projectId: "p-1",
    name: "Бригада 1",
    foremanId: "e-foreman",
    headcount: 6,
    specialization: "НВФ",
    memberIds: [],
    ...overrides,
  };
}

function report(overrides: Partial<FieldReport> = {}): FieldReport {
  return {
    id: "fr-1",
    projectId: "p-1",
    zoneId: "z-1",
    authorId: "e-foreman",
    crewId: "cr-1",
    date: "2026-09-18",
    sentAt: "2026-09-18T18:00:00",
    kind: "text",
    workType: "Монтаж кронштейнов",
    status: "review",
    summary: "Смонтировано 120 шт",
    declaredQty: 120,
    unit: "шт",
    acceptedQty: null,
    headcount: 6,
    sourceId: "src-1",
    issues: [],
    evidenceIds: [],
    ...overrides,
  };
}

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: "dl-1",
    requestId: "sr-1",
    projectId: "p-1",
    zoneId: null,
    supplierId: "s-a",
    decisionId: null,
    expectedAt: "2026-09-25",
    receivedAt: null,
    status: "expected",
    sourceId: null,
    items: [],
    ...overrides,
  };
}

function remark(overrides: Partial<DeliveryRemark> = {}): DeliveryRemark {
  return {
    id: "rm-1",
    deliveryId: "dl-1",
    projectId: "p-1",
    lineId: null,
    kind: "shortage",
    text: "Недостача 10 шт",
    createdAt: "2026-09-15T10:00:00",
    createdBy: "e-foreman",
    status: "open",
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    ...overrides,
  };
}

function change(overrides: Partial<RevisionChange> = {}): RevisionChange {
  return {
    id: "rc-1",
    documentId: "doc-spec",
    fromRevisionId: null,
    toRevisionId: "rev-1",
    description: "Изменён шаг подконструкции",
    status: "open",
    resolvedBy: null,
    resolvedAt: null,
    ...overrides,
  };
}

function source(overrides: Partial<OverviewSource> = {}): OverviewSource {
  return {
    projects: [project()],
    documents: [],
    positions: [],
    revisionChanges: [],
    requests: [],
    offers: [],
    decisions: [],
    crews: [],
    reports: [],
    deliveries: [],
    remarks: [],
    ...overrides,
  };
}

const NOW = "2026-09-20T12:00:00";
const revIds = (list: ProjectDocument[]) => list.map((item) => item.id);

/* ---------- currentRevisions ---------- */

describe("currentRevisions", () => {
  test("пустой список — пусто", () => {
    expect(currentRevisions([])).toEqual([]);
  });

  test("по документу — ревизия с наибольшим номером, независимо от порядка во входе", () => {
    const docs = [
      revision({ id: "spec-r3", revision: 3, uploadedAt: "2026-08-27T10:00:00" }),
      revision({ id: "spec-r1", revision: 1, uploadedAt: "2026-07-01T10:00:00" }),
      revision({ id: "spec-r2", revision: 2, uploadedAt: "2026-08-01T10:00:00" }),
    ];
    expect(revIds(currentRevisions(docs))).toEqual(["spec-r3"]);
  });

  test("решает номер ревизии, а не время загрузки", () => {
    const docs = [
      revision({ id: "spec-r2", revision: 2, uploadedAt: "2026-08-10T10:00:00" }),
      revision({ id: "spec-r1", revision: 1, uploadedAt: "2026-08-20T10:00:00" }),
    ];
    expect(revIds(currentRevisions(docs))).toEqual(["spec-r2"]);
  });

  test("одна действующая ревизия на документ, новые по загрузке сверху", () => {
    const docs = [
      revision({ id: "spec-r1", documentId: "doc-spec", uploadedAt: "2026-08-01T10:00:00" }),
      revision({ id: "ar-r1", documentId: "doc-ar", uploadedAt: "2026-09-01T10:00:00" }),
      revision({ id: "km-r1", documentId: "doc-km", uploadedAt: "2026-08-15T10:00:00" }),
    ];
    expect(revIds(currentRevisions(docs))).toEqual(["ar-r1", "km-r1", "spec-r1"]);
  });

  test("с объектом — только его документы, без объекта — все", () => {
    const docs = [
      revision({ id: "p1-spec", documentId: "doc-p1" }),
      revision({ id: "p2-spec", documentId: "doc-p2", projectId: "p-2" }),
    ];
    expect(revIds(currentRevisions(docs, "p-1"))).toEqual(["p1-spec"]);
    expect(revIds(currentRevisions(docs)).sort()).toEqual(["p1-spec", "p2-spec"]);
    expect(currentRevisions(docs, "p-3")).toEqual([]);
  });

  test("равные номера ревизий: в результате одна из них, документ не задваивается", () => {
    const docs = [
      revision({ id: "dup-a", revision: 2 }),
      revision({ id: "dup-b", revision: 2 }),
      revision({ id: "old", revision: 1 }),
    ];
    const result = currentRevisions(docs);
    expect(result).toHaveLength(1);
    expect(["dup-a", "dup-b"]).toContain(result[0]?.id ?? "");
  });
});

/* ---------- revisionsOf ---------- */

describe("revisionsOf", () => {
  test("ревизии одного документа, новые (по номеру) сверху", () => {
    const docs = [
      revision({ id: "r1", revision: 1 }),
      revision({ id: "r3", revision: 3 }),
      revision({ id: "other", documentId: "doc-ar", revision: 5 }),
      revision({ id: "r2", revision: 2 }),
    ];
    expect(revIds(revisionsOf(docs, "doc-spec"))).toEqual(["r3", "r2", "r1"]);
  });

  test("неизвестный документ и пустой список — пусто", () => {
    expect(revisionsOf([revision()], "doc-none")).toEqual([]);
    expect(revisionsOf([], "doc-spec")).toEqual([]);
  });

  test("входной массив не меняется", () => {
    const docs = [revision({ id: "r1", revision: 1 }), revision({ id: "r2", revision: 2 })];
    revisionsOf(docs, "doc-spec");
    expect(revIds(docs)).toEqual(["r1", "r2"]);
  });
});

/* ---------- revisionStats ---------- */

describe("revisionStats", () => {
  test("по загруженным позициям: только активные позиции этой ревизии", () => {
    const positions = [
      position({ id: "a", review: "pending" }),
      position({ id: "b", review: "confirmed" }),
      position({ id: "c", review: "corrected" }),
      position({ id: "d", review: "excluded" }),
      position({ id: "e", review: "merged", mergedInto: "a" }),
      position({ id: "f", review: "header" }),
      position({ id: "g", review: "confirmed", documentId: "rev-other" }),
    ];
    // активные: a b c = 3; проверены b c = 2
    expect(revisionStats(positions, revision())).toEqual({ total: 3, verified: 2, loaded: true });
  });

  test("нет позиций и нет счётчика — ноль, загружено", () => {
    expect(revisionStats([], revision())).toEqual({ total: 0, verified: 0, loaded: true });
  });

  test("позиции не загружены — счётчики ревизии (R20)", () => {
    const rev = revision({ positionsTotal: 120, positionsVerified: 45 });
    expect(revisionStats([], rev)).toEqual({ total: 120, verified: 45, loaded: false });
  });

  test("счётчик проверенных null — проверенных ноль", () => {
    const rev = revision({ positionsTotal: 120, positionsVerified: null });
    expect(revisionStats([], rev)).toEqual({ total: 120, verified: 0, loaded: false });
  });

  test("счётчик ноль — это ноль по счётчику, а не пересчёт", () => {
    const rev = revision({ positionsTotal: 0, positionsVerified: 0 });
    expect(revisionStats([], rev)).toEqual({ total: 0, verified: 0, loaded: false });
  });

  test("есть загруженные позиции — они важнее счётчика", () => {
    const rev = revision({ positionsTotal: 500, positionsVerified: 400 });
    const positions = [position({ id: "a" }), position({ id: "b", review: "confirmed" })];
    expect(revisionStats(positions, rev)).toEqual({ total: 2, verified: 1, loaded: true });
  });

  test("только исключённые позиции без счётчика — ноль, загружено", () => {
    const positions = [position({ review: "excluded" }), position({ id: "h", review: "header" })];
    expect(revisionStats(positions, revision())).toEqual({ total: 0, verified: 0, loaded: true });
  });
});

/* ---------- mainSpecification ---------- */

describe("mainSpecification", () => {
  test("действующая ревизия с наибольшим числом позиций, счётчики тоже считаются", () => {
    const documents = [
      revision({ id: "spec", documentId: "doc-spec" }),
      revision({ id: "ar", documentId: "doc-ar", positionsTotal: 120, positionsVerified: 0 }),
    ];
    const positions = [position({ id: "a", documentId: "spec" })]; // у spec — 1 позиция
    expect(mainSpecification({ documents, positions }, "p-1")?.id).toBe("ar");
  });

  test("загруженные позиции против меньшего счётчика", () => {
    const documents = [
      revision({ id: "spec", documentId: "doc-spec" }),
      revision({ id: "ar", documentId: "doc-ar", positionsTotal: 2, positionsVerified: 0 }),
    ];
    const positions = ["a", "b", "c"].map((id) => position({ id, documentId: "spec" }));
    expect(mainSpecification({ documents, positions }, "p-1")?.id).toBe("spec");
  });

  test("старая ревизия с большим числом позиций не участвует", () => {
    const documents = [
      revision({ id: "spec-r1", revision: 1, positionsTotal: 900, positionsVerified: 0 }),
      revision({ id: "spec-r2", revision: 2, positionsTotal: 10, positionsVerified: 0 }),
      revision({ id: "ar", documentId: "doc-ar", positionsTotal: 50, positionsVerified: 0 }),
    ];
    expect(mainSpecification({ documents, positions: [] }, "p-1")?.id).toBe("ar");
  });

  test("документ чужого объекта не участвует", () => {
    const documents = [
      revision({ id: "own", positionsTotal: 5, positionsVerified: 0 }),
      revision({
        id: "foreign",
        documentId: "doc-p2",
        projectId: "p-2",
        positionsTotal: 1000,
        positionsVerified: 0,
      }),
    ];
    expect(mainSpecification({ documents, positions: [] }, "p-1")?.id).toBe("own");
  });

  test("нет документов или у всех ноль позиций — null", () => {
    expect(mainSpecification({ documents: [], positions: [] }, "p-1")).toBeNull();
    const documents = [
      revision({ id: "empty" }),
      revision({ id: "zero", documentId: "doc-ar", positionsTotal: 0, positionsVerified: 0 }),
    ];
    expect(mainSpecification({ documents, positions: [] }, "p-1")).toBeNull();
  });
});

/* ---------- projectOverview ---------- */

describe("projectOverview", () => {
  test("неизвестный объект — null", () => {
    expect(projectOverview(source(), "p-none", NOW)).toBeNull();
  });

  test("объект без данных: нули и прочерк вместо версии", () => {
    expect(projectOverview(source(), "p-1", NOW)).toEqual({
      projectId: "p-1",
      region: "Москва",
      stage: "Монтаж фасада, этап 1",
      docVersion: "—",
      specTotal: 0,
      specUnverified: 0,
      inRequests: 0,
      offersReceived: 0,
      ordered: 0,
      inTransit: 0,
      delivered: 0,
      deliveriesToAccept: 0,
      openRemarks: 0,
      activeRequests: 0,
      overdueRequests: 0,
      openChanges: 0,
      missingReports: 0,
    });
  });

  test("полная сводка по формулам глоссария, §3", () => {
    const s = source({
      projects: [project(), project({ id: "p-2", region: "Казань" })],
      documents: [
        revision({ id: "spec-r2", revision: 2, version: "Рев. 2" }),
        revision({
          id: "spec-r3",
          revision: 3,
          version: "Рев. 3",
          uploadedAt: "2026-08-27T10:00:00",
        }),
        revision({
          id: "ar-r1",
          documentId: "doc-ar",
          version: "Рев. 1",
          positionsTotal: 4,
          positionsVerified: 1,
        }),
        revision({
          id: "x-r1",
          documentId: "doc-x",
          projectId: "p-2",
          positionsTotal: 1000,
          positionsVerified: 0,
        }),
      ],
      positions: [
        position({ id: "s1", documentId: "spec-r3" }),
        position({ id: "s2", documentId: "spec-r3" }),
        purchased({ id: "s3", documentId: "spec-r3", purchase: "requested", requestIds: ["r-a"] }),
        purchased({ id: "s4", documentId: "spec-r3", purchase: "offers", requestIds: ["r-a"] }),
        purchased({
          id: "s5",
          documentId: "spec-r3",
          review: "corrected",
          purchase: "supplier_selected",
        }),
        purchased({ id: "s6", documentId: "spec-r3", purchase: "ordered", requestIds: ["r-mov"] }),
        purchased({ id: "s7", documentId: "spec-r3", purchase: "ordered", requestIds: ["r-exp"] }),
        purchased({
          id: "s8",
          documentId: "spec-r3",
          review: "corrected",
          purchase: "delivered",
          requestIds: ["r-mov"],
        }),
        position({ id: "s9", documentId: "spec-r3", review: "excluded" }),
        purchased({ id: "s10", documentId: "spec-r3", purchase: "none" }),
        position({ id: "old", documentId: "spec-r2" }),
        purchased({
          id: "foreign",
          projectId: "p-2",
          documentId: "x-r1",
          purchase: "ordered",
          requestIds: ["r-mov"],
        }),
      ],
      requests: [
        request({ id: "r-draft", status: "draft", sentAt: null }),
        // просрочен: срок прошёл, ответил один из двух
        request({ id: "r-late", replyDueAt: "2026-09-19T18:00:00" }),
        // срок ровно сейчас — ещё не просрочен
        request({ id: "r-due-now", replyDueAt: NOW, sentTo: ["s-a"] }),
        // ответили все — готов, не просрочен
        request({ id: "r-ready", replyDueAt: "2026-09-19T18:00:00" }),
        // решение зафиксировано — не просрочен
        request({ id: "r-decision", replyDueAt: "2026-09-19T18:00:00" }),
        request({ id: "r-decided", status: "decided", replyDueAt: "2026-09-19T18:00:00" }),
        request({ id: "r-mov", status: "ordered" }),
        request({ id: "r-exp", status: "ordered" }),
        request({ id: "r-cancel", status: "cancelled", replyDueAt: "2026-09-19T18:00:00" }),
        request({ id: "r-p2", projectId: "p-2", replyDueAt: "2026-09-19T18:00:00" }),
      ],
      offers: [
        offer({ id: "o1", requestId: "r-late", supplierId: "s-a" }),
        offer({ id: "o2", requestId: "r-ready", supplierId: "s-a" }),
        offer({ id: "o3", requestId: "r-ready", supplierId: "s-b" }),
      ],
      decisions: [decision({ id: "d1", requestId: "r-decision" })],
      deliveries: [
        delivery({ id: "dl-mov", requestId: "r-mov", status: "in_transit" }),
        delivery({ id: "dl-exp", requestId: "r-exp", status: "expected" }),
        delivery({ id: "dl-arr", requestId: "r-arr", status: "arrived" }),
        delivery({ id: "dl-p2-ship", requestId: "r-exp", projectId: "p-2", status: "shipped" }),
        delivery({ id: "dl-p2-arr", requestId: "r-p2", projectId: "p-2", status: "arrived" }),
      ],
      remarks: [
        remark({ id: "rm1" }),
        remark({ id: "rm2" }),
        remark({ id: "rm3", status: "resolved", resolvedAt: NOW, resolvedBy: "e-dorohov" }),
        remark({ id: "rm4", projectId: "p-2" }),
      ],
      revisionChanges: [
        change({ id: "c1", documentId: "doc-spec" }),
        change({ id: "c2", documentId: "doc-spec", status: "resolved", resolvedAt: NOW }),
        change({ id: "c3", documentId: "doc-ar" }),
        change({ id: "c4", documentId: "doc-x" }),
      ],
      crews: [
        crew({ id: "cr-1" }),
        crew({ id: "cr-2" }),
        crew({ id: "cr-3" }),
        crew({ id: "cr-p2", projectId: "p-2" }),
      ],
      reports: [
        report({ id: "fr1", crewId: "cr-1", date: "2026-09-18" }),
        report({ id: "fr2", crewId: "cr-2", date: "2026-09-10" }),
        report({ id: "fr3", crewId: null, date: "2026-09-19" }),
      ],
    });

    expect(projectOverview(s, "p-1", NOW)).toEqual({
      projectId: "p-1",
      region: "Москва",
      stage: "Монтаж фасада, этап 1",
      // основная спецификация: spec-r3 (9 активных) против ar-r1 (счётчик 4)
      docVersion: "Рев. 3",
      // spec-r3: активные s1–s8, s10 = 9; ar-r1: 4 → 13. Старая spec-r2 и p-2 не считаются
      specTotal: 13,
      // проверены: s3–s8, s10 = 7; ar-r1: 1 → 8; 13 − 8 = 5
      specUnverified: 5,
      inRequests: 6, // s3 s4 s5 s6 s7 s8
      offersReceived: 5, // s4 s5 s6 s7 s8
      ordered: 3, // s6 s7 s8
      inTransit: 1, // s6: поставка r-mov едет; у r-exp в p-1 поставка только ожидается
      delivered: 1, // s8
      deliveriesToAccept: 1, // dl-arr
      openRemarks: 2, // rm1 rm2
      activeRequests: 5, // r-late r-due-now r-ready r-decision r-decided
      overdueRequests: 1, // r-late
      openChanges: 2, // c1 c3
      missingReports: 2, // cr-2 (отчёт 10 дней назад), cr-3 (отчётов нет)
    });
  });

  test("проверено + непроверено = всего", () => {
    const s = source({
      documents: [
        revision({ id: "spec" }),
        revision({ id: "ar", documentId: "doc-ar", positionsTotal: 30, positionsVerified: 12 }),
      ],
      positions: [
        position({ id: "a", documentId: "spec" }),
        purchased({ id: "b", documentId: "spec" }),
        position({ id: "c", documentId: "spec", review: "header" }),
      ],
    });
    const overview = projectOverview(s, "p-1", NOW);
    // всего: 2 + 30 = 32; проверено: 1 + 12 = 13; непроверено: 32 − 13 = 19
    expect(overview?.specTotal).toBe(32);
    expect(overview?.specUnverified).toBe(19);
  });

  test("в пути: поставка «отгружено» и «в пути», но не «ожидается» и не «прибыло»", () => {
    const s = source({
      positions: [
        purchased({ id: "shipped", purchase: "ordered", requestIds: ["r-ship"] }),
        purchased({ id: "moving", purchase: "ordered", requestIds: ["r-move"] }),
        purchased({ id: "expected", purchase: "ordered", requestIds: ["r-exp"] }),
        purchased({ id: "arrived", purchase: "ordered", requestIds: ["r-arr"] }),
        purchased({ id: "no-delivery", purchase: "ordered", requestIds: ["r-none"] }),
      ],
      deliveries: [
        delivery({ id: "d1", requestId: "r-ship", status: "shipped" }),
        delivery({ id: "d2", requestId: "r-move", status: "in_transit" }),
        delivery({ id: "d3", requestId: "r-exp", status: "expected" }),
        delivery({ id: "d4", requestId: "r-arr", status: "arrived" }),
      ],
    });
    const overview = projectOverview(s, "p-1", NOW);
    expect(overview?.inTransit).toBe(2);
    expect(overview?.ordered).toBe(5);
    expect(overview?.deliveriesToAccept).toBe(1);
  });

  test("в пути: позиции считаются по одной, даже если едут по двум запросам", () => {
    const s = source({
      positions: [
        purchased({ id: "a", purchase: "ordered", requestIds: ["r-1", "r-2"] }),
        purchased({ id: "b", purchase: "ordered", requestIds: ["r-2"] }),
      ],
      deliveries: [
        delivery({ id: "d1", requestId: "r-1", status: "shipped" }),
        delivery({ id: "d2", requestId: "r-2", status: "in_transit" }),
      ],
    });
    expect(projectOverview(s, "p-1", NOW)?.inTransit).toBe(2); // a и b
  });

  test("в пути: поставленная позиция и непроверенная не считаются", () => {
    const s = source({
      positions: [
        purchased({ id: "delivered", purchase: "delivered", requestIds: ["r-1"] }),
        position({ id: "pending", requestIds: ["r-1"] }),
      ],
      deliveries: [delivery({ requestId: "r-1", status: "in_transit" })],
    });
    expect(projectOverview(s, "p-1", NOW)?.inTransit).toBe(0);
  });

  test("закупочные счётчики не видят исключённые позиции", () => {
    const s = source({
      positions: [
        purchased({ id: "a", purchase: "ordered" }),
        purchased({ id: "b", purchase: "ordered", review: "excluded" }),
      ],
    });
    expect(projectOverview(s, "p-1", NOW)?.ordered).toBe(1);
  });

  test("просрочка: срок ровно сейчас — нет, секундой раньше — да", () => {
    const at = (replyDueAt: string) =>
      projectOverview(source({ requests: [request({ replyDueAt })] }), "p-1", NOW)?.overdueRequests;
    expect(at(NOW)).toBe(0);
    expect(at("2026-09-20T11:59:59")).toBe(1);
  });

  test("просрочка: без срока ответа не просрочен", () => {
    const s = source({ requests: [request({ replyDueAt: null })] });
    const overview = projectOverview(s, "p-1", NOW);
    expect(overview?.activeRequests).toBe(1);
    expect(overview?.overdueRequests).toBe(0);
  });

  test("отсутствующие отчёты: отчёт 6 дней назад — есть, 8 дней назад — нет", () => {
    const s = (date: string) =>
      source({ crews: [crew({ id: "cr-1" })], reports: [report({ crewId: "cr-1", date })] });
    expect(projectOverview(s("2026-09-14"), "p-1", NOW)?.missingReports).toBe(0);
    expect(projectOverview(s("2026-09-12"), "p-1", NOW)?.missingReports).toBe(1);
  });

  test("отсутствующие отчёты: отчёт другой бригады не закрывает бригаду", () => {
    const s = source({
      crews: [crew({ id: "cr-1" }), crew({ id: "cr-2" })],
      reports: [report({ crewId: "cr-2", date: "2026-09-19" })],
    });
    expect(projectOverview(s, "p-1", NOW)?.missingReports).toBe(1);
  });

  test("отсутствующие отчёты: окно 7 дней не зависит от пояса пользователя (Москва, ночь)", () => {
    // Сейчас 20.09 01:00 по местному времени; 7 дней назад — 13.09 01:00.
    // Отчёт за 12.09 целиком раньше окна, значит бригада без отчёта.
    const saved = process.env["TZ"];
    process.env["TZ"] = "Europe/Moscow";
    try {
      const s = source({
        crews: [crew({ id: "cr-1" })],
        reports: [report({ crewId: "cr-1", date: "2026-09-12" })],
      });
      expect(projectOverview(s, "p-1", "2026-09-20T01:00:00")?.missingReports).toBe(1);
    } finally {
      if (saved === undefined) delete process.env["TZ"];
      else process.env["TZ"] = saved;
    }
  });
});
