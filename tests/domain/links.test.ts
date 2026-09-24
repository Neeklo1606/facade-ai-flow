import { describe, expect, test } from "bun:test";
import {
  deliveryLinks,
  positionLinks,
  positionOrigin,
  reportLinks,
  requestLinks,
} from "@/domain/links";
import type { Delivery, ExtractedPosition } from "@/contracts";
import type { RequestSummary } from "@/ports";

/**
 * Связи между сущностями (ADR-018). Главное правило проверяется здесь: связь появляется,
 * только если она есть в данных. Всё остальное — тексты и адреса переходов.
 */

const position = (patch: Partial<ExtractedPosition> = {}) =>
  ({
    id: "pos-1",
    projectId: "p-korona",
    documentId: "pd-spec",
    sheetNumber: 84,
    position: "1.1",
    materialId: "mat-vata",
    requestIds: [],
    deliveredQty: null,
    ...patch,
  }) as ExtractedPosition;

const summary = (id: string, patch: Partial<RequestSummary> = {}) =>
  ({
    request: { id, number: "З-2026/324", items: [{ name: "Минеральная вата 100 мм" }], sentTo: [] },
    answered: 1,
    ...patch,
  }) as unknown as RequestSummary;

const delivery = (patch: Partial<Delivery> = {}) =>
  ({
    id: "dl-502",
    requestId: "sr-324",
    status: "accepted",
    receivedAt: "2026-08-30T10:05:00+03:00",
    items: [{ materialId: "mat-vata", name: "Минеральная вата 100 мм" }],
    ...patch,
  }) as unknown as Delivery;

describe("связи позиции", () => {
  test("без запросов и поставок связей нет: пустой блок не показывается", () => {
    expect(positionLinks({ position: position(), requests: [], deliveries: [] })).toEqual([]);
  });

  test("запрос появляется, только если позиция в него вошла", () => {
    const requests = [summary("sr-324")];
    expect(positionLinks({ position: position(), requests, deliveries: [] })).toEqual([]);

    const links = positionLinks({
      position: position({ requestIds: ["sr-324"] }),
      requests,
      deliveries: [],
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      title: "З-2026/324",
      to: "/projects/p-korona/procurement/sr-324",
    });
  });

  test("поставка связана через запрос и состав: чужая поставка не показывается", () => {
    const requests = [summary("sr-324")];
    const mine = position({ requestIds: ["sr-324"] });

    // Поставка по другому запросу
    expect(
      positionLinks({
        position: mine,
        requests,
        deliveries: [delivery({ requestId: "sr-999" })],
      }).filter((link) => link.label === "Поставка"),
    ).toEqual([]);

    // Поставка по тому же запросу, но с другим материалом в составе
    expect(
      positionLinks({
        position: mine,
        requests,
        deliveries: [
          delivery({ items: [{ materialId: "mat-other", name: "Кронштейн" }] as never }),
        ],
      }).filter((link) => link.label === "Поставка"),
    ).toEqual([]);

    const links = positionLinks({ position: mine, requests, deliveries: [delivery()] });
    expect(links.map((link) => link.label)).toEqual(["Запрос поставщикам", "Поставка"]);
    expect(links[1]).toMatchObject({
      to: "/projects/p-korona/deliveries",
      search: { delivery: "dl-502" },
      hint: "принята 30.08",
    });
  });

  test("у позиции без сопоставления материала поставки нет: связать не с чем", () => {
    const links = positionLinks({
      position: position({ requestIds: ["sr-324"], materialId: null }),
      requests: [summary("sr-324")],
      deliveries: [delivery()],
    });
    expect(links.map((link) => link.label)).toEqual(["Запрос поставщикам"]);
  });
});

describe("происхождение позиции", () => {
  test("документ, лист и номер ведут в оригинал", () => {
    const origin = positionOrigin(position(), "Спецификация фасадных материалов");
    expect(origin.steps.map((step) => `${step.label} ${step.value}`)).toEqual([
      "Документ Спецификация фасадных материалов",
      "Лист 84",
      "Позиция 1.1",
    ]);
    expect(origin.to).toBe("/projects/p-korona/documents/pd-spec");
    expect(origin.search).toEqual({ position: "pos-1" });
  });
});

describe("связи поставки и запроса", () => {
  test("поставка ведёт к материалам состава; запрос не дублируется — он в шапке панели", () => {
    const links = deliveryLinks({ card: { delivery: delivery() }, projectId: "p-korona" });
    expect(links.map((link) => link.label)).toEqual(["Материал в реестре"]);
    expect(links[0]).toMatchObject({
      to: "/projects/p-korona/materials",
      search: { purchase: "ordered" },
    });
  });

  test("поставка без сопоставленных материалов связей не даёт", () => {
    const links = deliveryLinks({
      card: { delivery: delivery({ items: [{ materialId: null, name: "Прочее" }] as never }) },
      projectId: "p-korona",
    });
    expect(links).toEqual([]);
  });

  test("запрос ведёт к позициям, а поставка — только когда она есть", () => {
    const request = { id: "sr-324", items: [{ name: "Минеральная вата 100 мм" }] };
    expect(
      requestLinks({ request, deliveries: [], projectId: "p-korona" }).map((link) => link.label),
    ).toEqual(["Позиция запроса"]);

    expect(
      requestLinks({ request, deliveries: [delivery()], projectId: "p-korona" }).map(
        (link) => link.label,
      ),
    ).toEqual(["Позиция запроса", "Поставка по решению"]);
  });
});

describe("связи отчёта с площадки", () => {
  test("захватка ведёт в ход работ; без захватки связи нет", () => {
    expect(reportLinks({ projectId: "p-korona", zoneName: null })).toEqual([]);
    expect(
      reportLinks({ projectId: "p-korona", zoneName: "Захватка 2, оси Г–К" })[0],
    ).toMatchObject({ to: "/projects/p-korona", search: { tab: "progress" } });
  });
});
