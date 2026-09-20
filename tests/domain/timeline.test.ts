import { describe, expect, test } from "bun:test";
import type { ProjectDecisionRow, ProjectEvent, TimelineEvent } from "@/contracts";
import { decisionLink, eventLink, timelineOf } from "@/domain/timeline";

type Decision = ProjectDecisionRow & { link: TimelineEvent["link"] };

/** Событие без ссылок на сущности */
function event(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "tl-1",
    projectId: "p-1",
    occurredAt: "2026-09-01T10:00:00",
    type: "version_uploaded",
    title: "Загружена ревизия 3",
    details: null,
    actorKind: "system",
    actorId: null,
    sourceId: null,
    requestId: null,
    revisionId: null,
    positionId: null,
    reportId: null,
    deliveryId: null,
    ...overrides,
  };
}

/** Решение о замене без ссылок на запрос и отчёт */
function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "dc-1",
    projectId: "p-1",
    kind: "replacement",
    requestId: null,
    supplierId: null,
    reportId: null,
    materialFamily: "bracket",
    title: "Замена кронштейна",
    requirement: "Нагрузка по расчёту КМ",
    problem: "Нет в наличии",
    options: ["КН-1", "КН-2"],
    choice: "КН-2",
    reason: "Срок поставки",
    approvedBy: "e-sokolov",
    approvedAt: "2026-09-02T10:00:00",
    basisLabel: "Письмо поставщика",
    basisSourceId: "src-1",
    link: null,
    ...overrides,
  };
}

const requests = [
  { id: "sr-324", number: "З-2026/324" },
  { id: "sr-325", number: "З-2026/325" },
];

describe("decisionLink", () => {
  test("решение по запросу ведёт в запрос с его номером", () => {
    expect(decisionLink(decision({ kind: "supplier", requestId: "sr-324" }), requests)).toEqual({
      to: "/projects/p-1/procurement/sr-324",
      label: "Запрос З-2026/324",
    });
  });

  test("номер запроса неизвестен — подпись без номера и без хвостового пробела", () => {
    expect(decisionLink(decision({ kind: "supplier", requestId: "sr-999" }), [])).toEqual({
      to: "/projects/p-1/procurement/sr-999",
      label: "Запрос",
    });
  });

  test("решение по отчёту ведёт в отчёты с площадки", () => {
    expect(decisionLink(decision({ kind: "quantity", reportId: "fr-1" }), requests)).toEqual({
      to: "/projects/p-1/field-reports",
      label: "Отчёт с площадки",
    });
  });

  test("замена без запроса и отчёта ведёт в материалы", () => {
    expect(decisionLink(decision(), requests)).toEqual({
      to: "/projects/p-1/materials",
      label: "Материалы",
    });
  });

  test("запрос важнее отчёта, отчёт важнее семейства материала", () => {
    const both = decision({ requestId: "sr-325", reportId: "fr-1" });
    expect(decisionLink(both, requests)?.to).toBe("/projects/p-1/procurement/sr-325");
    const reportAndFamily = decision({ reportId: "fr-1" });
    expect(decisionLink(reportAndFamily, requests)?.to).toBe("/projects/p-1/field-reports");
  });

  test("решение о поставщике или количестве без ссылок — без ссылки", () => {
    expect(decisionLink(decision({ kind: "supplier" }), requests)).toBeNull();
    expect(decisionLink(decision({ kind: "quantity" }), requests)).toBeNull();
  });

  test("адрес строится от объекта решения", () => {
    expect(decisionLink(decision({ projectId: "p-meridian" }), requests)?.to).toBe(
      "/projects/p-meridian/materials",
    );
  });
});

describe("eventLink: со ссылками на сущности", () => {
  test("событие поставки ведёт в карточку поставки (ADR-011)", () => {
    for (const type of [
      "delivery_moved",
      "delivery_received",
      "delivery_rejected",
      "delivery_remark",
    ] as const) {
      expect(eventLink(event({ type, deliveryId: "dl-502" }), requests)).toEqual({
        to: "/projects/p-1/deliveries?delivery=dl-502",
        label: "Поставка",
      });
    }
  });

  test("поставка важнее запроса", () => {
    const e = event({ type: "delivery_received", deliveryId: "dl-502", requestId: "sr-324" });
    expect(eventLink(e, requests)?.label).toBe("Поставка");
  });

  test("предложение поставщика ведёт в сравнение предложений", () => {
    expect(eventLink(event({ type: "offer_received", requestId: "sr-324" }), requests)).toEqual({
      to: "/projects/p-1/procurement/sr-324",
      label: "Сравнение предложений",
    });
  });

  test("создание запроса ведёт в запрос с номером", () => {
    expect(eventLink(event({ type: "request_created", requestId: "sr-325" }), requests)).toEqual({
      to: "/projects/p-1/procurement/sr-325",
      label: "Запрос З-2026/325",
    });
  });

  test("номер запроса неизвестен — «Запрос» без номера", () => {
    expect(eventLink(event({ type: "request_created", requestId: "sr-999" }), [])).toEqual({
      to: "/projects/p-1/procurement/sr-999",
      label: "Запрос",
    });
  });

  test("заказ по запросу ведёт в запрос, а не в список заказанных", () => {
    const e = event({ type: "material_ordered", requestId: "sr-324" });
    expect(eventLink(e, requests)).toEqual({
      to: "/projects/p-1/procurement/sr-324",
      label: "Запрос З-2026/324",
    });
  });

  test("событие ревизии ведёт в документ", () => {
    for (const type of ["version_uploaded", "spec_extracted"] as const) {
      expect(eventLink(event({ type, revisionId: "pd-korona-spec" }), requests)).toEqual({
        to: "/projects/p-1/documents/pd-korona-spec",
        label: "Документ",
      });
    }
  });

  test("исправление позиции ведёт в документ на эту позицию", () => {
    const e = event({ type: "qty_corrected", revisionId: "pd-korona-spec", positionId: "pos-7" });
    expect(eventLink(e, requests)).toEqual({
      to: "/projects/p-1/documents/pd-korona-spec?position=pos-7",
      label: "Документ",
    });
  });

  test("отчёт с площадки ведёт в отчёты", () => {
    expect(eventLink(event({ type: "report_added", reportId: "fr-1" }), requests)).toEqual({
      to: "/projects/p-1/field-reports",
      label: "Отчёт с площадки",
    });
  });

  test("адрес строится от объекта события", () => {
    const e = event({ projectId: "p-school", type: "report_added", reportId: "fr-1" });
    expect(eventLink(e, requests)?.to).toBe("/projects/p-school/field-reports");
  });
});

describe("eventLink: без ссылок на сущности", () => {
  test("заказ — в заказанные материалы", () => {
    expect(eventLink(event({ type: "material_ordered" }), requests)).toEqual({
      to: "/projects/p-1/materials?purchase=ordered",
      label: "Заказанные материалы",
    });
  });

  test("принятая поставка — в поставленные материалы", () => {
    expect(eventLink(event({ type: "delivery_received" }), requests)).toEqual({
      to: "/projects/p-1/materials?purchase=delivered",
      label: "Поставленные материалы",
    });
  });

  test("замена предложена или согласована — в материалы", () => {
    for (const type of ["replacement_proposed", "replacement_agreed"] as const) {
      expect(eventLink(event({ type }), requests)).toEqual({
        to: "/projects/p-1/materials",
        label: "Материалы",
      });
    }
  });

  test("остальные типы без ссылок — без ссылки", () => {
    for (const type of [
      "version_uploaded",
      "spec_extracted",
      "qty_corrected",
      "request_created",
      "offer_received",
      "delivery_moved",
      "delivery_rejected",
      "delivery_remark",
      "report_added",
    ] as const) {
      expect(eventLink(event({ type }), requests)).toBeNull();
    }
  });
});

describe("timelineOf", () => {
  test("пустые данные — пустая лента", () => {
    expect(timelineOf({ events: [], decisions: [], requests: [] }, "p-1")).toEqual([]);
  });

  test("события и решения объекта, новые сверху", () => {
    const s = {
      events: [
        event({ id: "e-old", occurredAt: "2026-08-20T10:00:00" }),
        event({ id: "e-new", occurredAt: "2026-09-03T10:00:00" }),
        event({ id: "e-foreign", projectId: "p-2", occurredAt: "2026-09-10T10:00:00" }),
      ],
      decisions: [
        decision({ id: "dc-mid", approvedAt: "2026-08-25T10:00:00" }),
        decision({ id: "dc-foreign", projectId: "p-2", approvedAt: "2026-09-11T10:00:00" }),
      ],
      requests,
    };
    expect(timelineOf(s, "p-1").map((item) => item.id)).toEqual(["e-new", "tl-dc-mid", "e-old"]);
  });

  test("событие переносится в ленту со своей ссылкой", () => {
    const e = event({
      id: "tl-2",
      occurredAt: "2026-08-21T15:30:00",
      type: "offer_received",
      title: "Получено предложение «СтройКрепёж»",
      details: "7 дней",
      actorKind: "user",
      actorId: "e-dorohov",
      sourceId: "src-mail",
      requestId: "sr-324",
    });
    expect(timelineOf({ events: [e], decisions: [], requests }, "p-1")).toEqual([
      {
        id: "tl-2",
        projectId: "p-1",
        at: "2026-08-21T15:30:00",
        type: "offer_received",
        title: "Получено предложение «СтройКрепёж»",
        details: "7 дней",
        actorId: "e-dorohov",
        sourceId: "src-mail",
        link: { to: "/projects/p-1/procurement/sr-324", label: "Сравнение предложений" },
      },
    ]);
  });

  test("решение: тип «decision», причина в деталях, автор — утвердивший, основание — источник", () => {
    const link = { to: "/projects/p-1/procurement/sr-324", label: "Запрос З-2026/324" };
    const d = decision({ id: "dc-7", reason: "Дешевле на 4 %", link });
    expect(timelineOf({ events: [], decisions: [d], requests }, "p-1")).toEqual([
      {
        id: "tl-dc-7",
        projectId: "p-1",
        at: "2026-09-02T10:00:00",
        type: "decision",
        title: "Замена кронштейна",
        details: "Дешевле на 4 %",
        actorId: "e-sokolov",
        sourceId: "src-1",
        link,
      },
    ]);
  });

  test("ссылка решения берётся как есть, в том числе null", () => {
    const d = decision({ link: null });
    expect(timelineOf({ events: [], decisions: [d], requests }, "p-1")[0]?.link).toBeNull();
  });

  test("событие без ссылок — ссылка null", () => {
    const e = event({ type: "delivery_moved" });
    expect(timelineOf({ events: [e], decisions: [], requests }, "p-1")[0]?.link).toBeNull();
  });

  test("события одного момента сохраняют порядок журнала", () => {
    const at = "2026-09-01T10:00:00";
    const s = {
      events: [
        event({ id: "a", occurredAt: at }),
        event({ id: "b", occurredAt: at }),
        event({ id: "c", occurredAt: at }),
      ],
      decisions: [],
      requests,
    };
    expect(timelineOf(s, "p-1").map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  test("чужой объект — пустая лента", () => {
    const s = { events: [event()], decisions: [decision()], requests };
    expect(timelineOf(s, "p-2")).toEqual([]);
  });
});
