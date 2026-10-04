import { describe, expect, test } from "bun:test";
import {
  comingDeliveries,
  returnedReports,
  todayOf,
  todayWorks,
  zoneLabel,
  type TodaySource,
} from "@/domain/today";

/**
 * Формулы экрана «Сегодня» (ADR-028, п. 2). Проверяется то, из-за чего экран был бы
 * бесполезен: «сегодня» должно значить дату источника данных, а не устройства; поставка,
 * которую уже приняли, ждать нечего; возвращённый отчёт обязан попасть в свой блок.
 */

const base: TodaySource = {
  now: "2026-09-05T12:00:00",
  projects: [
    { id: "p-1", name: "ЖК «Северная Корона»" },
    { id: "p-2", name: "БЦ «Меридиан»" },
  ],
  zones: [zone("z-1", "p-1", "Захватка 2, оси Г–К", "Г–К"), zone("z-2", "p-1", "Фасад Ж", "1–4")],
  reports: [
    report("r-1", "p-1", "z-1", "2026-09-05", "review", 184),
    report("r-2", "p-1", "z-2", "2026-09-04", "accepted", 90),
    report("r-3", "p-2", "z-1", "2026-09-05", "returned", 12),
  ],
  deliveries: [
    delivery("d-1", "p-1", "2026-09-08", "in_transit"),
    delivery("d-2", "p-1", "2026-09-01", "expected"),
    delivery("d-3", "p-1", "2026-09-02", "accepted"),
  ],
};

function zone(id: string, projectId: string, name: string, axes: string | null) {
  return {
    id,
    projectId,
    parentId: null,
    level: "zone" as const,
    name,
    axes,
    floors: null,
    planQty: 500,
    factQty: 100,
    unit: "м²",
  };
}

function report(
  id: string,
  projectId: string,
  zoneId: string,
  date: string,
  status: "review" | "accepted" | "returned",
  declaredQty: number,
) {
  return {
    id,
    projectId,
    zoneId,
    authorId: "e-gareev",
    crewId: null,
    date,
    sentAt: `${date}T08:00:00`,
    kind: "text" as const,
    workType: "Монтаж облицовки",
    status,
    summary: "Смонтировано по проекту",
    declaredQty,
    unit: "м²",
    acceptedQty: status === "accepted" ? declaredQty : null,
    headcount: 4,
    sourceId: "s-1",
    issues: [],
    evidenceIds: [],
  };
}

function delivery(
  id: string,
  projectId: string,
  expectedAt: string,
  status: "expected" | "in_transit" | "accepted",
) {
  return {
    id,
    requestId: "sr-1",
    projectId,
    zoneId: null,
    supplierId: "c-1",
    decisionId: null,
    expectedAt,
    receivedAt: status === "accepted" ? expectedAt : null,
    status,
    sourceId: null,
    items: [],
  };
}

describe("«сегодня»", () => {
  test("берётся из часов источника данных, а не устройства", () => {
    expect(todayOf(base)).toBe("2026-09-05");
  });

  test("в смену попадают только отчёты сегодняшней даты", () => {
    const works = todayWorks(base);
    expect(works.map((work) => work.id).sort()).toEqual(["r-1", "r-3"]);
  });

  test("объём непринятого отчёта показывается заявленным", () => {
    const work = todayWorks(base).find((item) => item.id === "r-1")!;
    expect(work.qty).toBe(184);
    expect(work.status).toBe("review");
  });

  test("подпись захватки не повторяет оси, если они уже в названии", () => {
    expect(zoneLabel(base.zones[0])).toBe("Захватка 2, оси Г–К");
    expect(zoneLabel(base.zones[1])).toBe("Фасад Ж, оси 1–4");
    expect(zoneLabel(undefined)).toBe("Захватка");
  });
});

describe("ожидаемые поставки", () => {
  test("принятую поставку больше не ждут", () => {
    expect(comingDeliveries(base).map((item) => item.id)).not.toContain("d-3");
  });

  test("просроченная идёт первой и помечена", () => {
    const rows = comingDeliveries(base);
    expect(rows[0]?.id).toBe("d-2");
    expect(rows[0]?.overdue).toBe(true);
    expect(rows[1]?.overdue).toBe(false);
  });
});

describe("вернулось на доработку", () => {
  test("попадают только возвращённые отчёты, независимо от даты", () => {
    const rows = returnedReports(base);
    expect(rows.map((row) => row.id)).toEqual(["r-3"]);
    expect(rows[0]?.projectName).toBe("БЦ «Меридиан»");
  });
});
