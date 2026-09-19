import { describe, expect, test } from "bun:test";
import type { Contract, FieldReport, Milestone, Project, WorkZone } from "@/contracts";
import {
  milestoneTimeline,
  progressMetrics,
  silentCrews,
  teamMetrics,
  teamRows,
  zoneRows,
  type MilestonePoint,
  type MilestoneTimeline,
  type ProgressMetric,
  type TeamCrew,
  type TeamMetric,
  type TeamPerson,
  type ZoneRow,
} from "@/domain/work-progress";

/* ---------- Фабрики ---------- */

/** Договор 01.01–11.01.2026: 10 суток, 06.01 00:00 — ровно половина срока */
const START = "2026-01-01";
const END = "2026-01-11";
const MIDDLE = "2026-01-06T00:00:00";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    name: "БЦ «Меридиан»",
    code: "МР-1",
    customerId: "c-1",
    customer: "Проект-Инвест",
    region: "Москва",
    stage: "Северный фасад",
    status: "active",
    manager: "e-1",
    startDate: START,
    endDate: END,
    contractId: "k-1",
    contract: "Д-1",
    ...overrides,
  };
}

function zone(overrides: Partial<WorkZone> = {}): WorkZone {
  return {
    id: "z-1",
    projectId: "p-1",
    parentId: null,
    level: "zone",
    name: "Захватка 1",
    axes: "1–5",
    floors: "1–3",
    planQty: 100,
    factQty: 0,
    unit: "м²",
    ...overrides,
  };
}

function report(overrides: Partial<FieldReport> = {}): FieldReport {
  const status = overrides.status ?? "review";
  return {
    id: "fr-1",
    projectId: "p-1",
    zoneId: "z-1",
    authorId: "e-1",
    crewId: null,
    date: "2026-01-05",
    sentAt: "2026-01-05T18:00:00",
    kind: "text",
    workType: "Монтаж облицовки",
    status,
    summary: "Смонтировано",
    declaredQty: 10,
    unit: "м²",
    acceptedQty: status === "accepted" ? 10 : null,
    headcount: 5,
    sourceId: "src-1",
    issues: [],
    evidenceIds: [],
    ...overrides,
  };
}

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "m-1",
    projectId: "p-1",
    contractId: "k-1",
    name: "Этап 1",
    dueDate: "2026-01-06",
    requirement: "Смонтировать облицовку",
    status: "planned",
    sourceId: null,
    location: "",
    ...overrides,
  };
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "k-1",
    projectId: "p-1",
    customerId: "c-1",
    number: "Д-1",
    signedAt: "2025-12-20",
    startDate: START,
    endDate: END,
    amount: 100_000_000,
    advance: 0,
    retentionPct: 5,
    paymentTermDays: 30,
    status: "active",
    sourceId: "src-k",
    ...overrides,
  };
}

function zoneRow(overrides: Partial<ZoneRow> = {}): ZoneRow {
  return {
    id: "z-1",
    name: "Захватка 1",
    axes: null,
    floors: null,
    workType: null,
    planQty: 100,
    factQty: 0,
    unit: "м²",
    donePct: 0,
    planPct: 50,
    deviationPp: -50,
    lastFact: null,
    ...overrides,
  };
}

function point(overrides: Partial<MilestonePoint> = {}): MilestonePoint {
  return {
    id: "m-1",
    name: "Этап 1",
    dueDate: "2026-01-20",
    requirement: "Смонтировать облицовку",
    status: "planned",
    statusLabel: "По плану",
    past: false,
    offset: 0.5,
    sourceId: null,
    location: null,
    ...overrides,
  };
}

function timeline(points: MilestonePoint[]): MilestoneTimeline {
  return { points, todayOffset: 0.5, from: START, to: END };
}

function crew(overrides: Partial<TeamCrew> = {}): TeamCrew {
  return {
    id: "cr-1",
    name: "Бригада 1",
    foremanName: "Гареев",
    headcount: 8,
    specialization: "Облицовка",
    lastZone: null,
    ...overrides,
  };
}

function lastAt(at: string): TeamCrew["lastZone"] {
  return { id: "z-1", name: "Захватка 1", at };
}

function person(overrides: Partial<TeamPerson> = {}): TeamPerson {
  return {
    id: "e-1",
    name: "Гареев",
    position: "Прораб",
    role: "foreman",
    phone: "+7 900 000-00-00",
    telegram: null,
    crewName: null,
    lastReport: null,
    projectCount: 1,
    ...overrides,
  };
}

function byKey<T extends { key: string }>(list: T[], key: string): T {
  const found = list.find((item) => item.key === key);
  if (!found) throw new Error(`нет метрики ${key}`);
  return found;
}

/** Выполнить в заданном часовом поясе машины и вернуть пояс обратно */
function inTimeZone(tz: string, run: () => void) {
  const original = process.env["TZ"];
  process.env["TZ"] = tz;
  try {
    run();
  } finally {
    process.env["TZ"] = original ?? "UTC";
  }
}

/* ---------- Захватки ---------- */

describe("zoneRows", () => {
  test("готовность, доля срока и отклонение по захватке", () => {
    // 50 из 200 = 25%; половина срока = 50%; 25 − 50 = −25
    const [row] = zoneRows([zone({ planQty: 200, factQty: 50 })], [], project(), MIDDLE);
    expect(row).toEqual({
      id: "z-1",
      name: "Захватка 1",
      axes: "1–5",
      floors: "1–3",
      workType: null,
      planQty: 200,
      factQty: 50,
      unit: "м²",
      donePct: 25,
      planPct: 50,
      deviationPp: -25,
      lastFact: null,
    });
  });

  test("факт больше плана: готовность ограничена 100%, сам факт показан как есть", () => {
    const [row] = zoneRows([zone({ planQty: 200, factQty: 250 })], [], project(), MIDDLE);
    expect(row?.donePct).toBe(100);
    expect(row?.factQty).toBe(250);
    expect(row?.deviationPp).toBe(50); // 100 − 50
  });

  test("нулевой план — готовность 0 без деления на ноль", () => {
    const [row] = zoneRows([zone({ planQty: 0, factQty: 0 })], [], project(), MIDDLE);
    expect(row?.donePct).toBe(0);
  });

  test("до начала договора доля срока 0, после окончания — 100", () => {
    const planPct = (now: string) => zoneRows([zone()], [], project(), now)[0]?.planPct;
    expect(planPct("2025-12-25T00:00:00")).toBe(0);
    expect(planPct(`${START}T00:00:00`)).toBe(0);
    expect(planPct(`${END}T00:00:00`)).toBe(100);
    expect(planPct("2026-02-01T00:00:00")).toBe(100);
  });

  test("срок договора нулевой или перевёрнут — доля срока и отклонение неизвестны", () => {
    const same = zoneRows([zone()], [], project({ endDate: START }), MIDDLE)[0];
    expect(same?.planPct).toBeNull();
    expect(same?.deviationPp).toBeNull();
    const reversed = zoneRows([zone()], [], project({ startDate: END, endDate: START }), MIDDLE)[0];
    expect(reversed?.planPct).toBeNull();
  });

  test("отклонение — разность уже округлённых процентов", () => {
    // 01.01–04.01, сегодня 02.01: 1/3 → 33; факт 2 из 3 → 67; 67 − 33 = 34
    const [row] = zoneRows(
      [zone({ planQty: 3, factQty: 2 })],
      [],
      project({ endDate: "2026-01-04" }),
      "2026-01-02T00:00:00",
    );
    expect(row?.donePct).toBe(67);
    expect(row?.planPct).toBe(33);
    expect(row?.deviationPp).toBe(34);
  });

  test("вид работ — из самого свежего отчёта по захватке любого статуса", () => {
    const [row] = zoneRows(
      [zone()],
      [
        report({ id: "old", sentAt: "2026-01-03T10:00:00", workType: "Подконструкция" }),
        report({
          id: "new",
          sentAt: "2026-01-05T10:00:00",
          workType: "Облицовка",
          status: "returned",
        }),
        report({ id: "other", zoneId: "z-2", sentAt: "2026-01-06T10:00:00", workType: "Чужая" }),
      ],
      project(),
      MIDDLE,
    );
    expect(row?.workType).toBe("Облицовка");
  });

  test("последний факт — из самого свежего принятого отчёта; новые на проверке его не заменяют", () => {
    const [row] = zoneRows(
      [zone()],
      [
        report({ id: "a1", status: "accepted", sentAt: "2026-01-02T10:00:00", acceptedQty: 5 }),
        report({
          id: "a2",
          status: "accepted",
          sentAt: "2026-01-04T10:00:00",
          acceptedQty: 12,
          declaredQty: 15,
          sourceId: "src-a2",
        }),
        report({ id: "r1", status: "review", sentAt: "2026-01-05T10:00:00" }),
        report({ id: "x1", status: "returned", sentAt: "2026-01-05T11:00:00" }),
      ],
      project(),
      MIDDLE,
    );
    expect(row?.lastFact).toEqual({
      reportId: "a2",
      sourceId: "src-a2",
      at: "2026-01-04T10:00:00",
      qty: 12,
    });
  });

  test("нет принятых отчётов — последнего факта нет", () => {
    const [row] = zoneRows([zone()], [report({ status: "review" })], project(), MIDDLE);
    expect(row?.lastFact).toBeNull();
  });

  test("пустой список захваток — пустой результат", () => {
    expect(zoneRows([], [report()], project(), MIDDLE)).toEqual([]);
  });

  test("доля срока не зависит от часового пояса машины (UTC+8)", () => {
    // 06.01 00:00 местного времени — ровно середина 01.01–11.01
    inTimeZone("Asia/Makassar", () => {
      expect(zoneRows([zone()], [], project(), MIDDLE)[0]?.planPct).toBe(50);
    });
  });
});

/* ---------- Контрольные точки ---------- */

describe("milestoneTimeline", () => {
  test("точки по сроку, ось от первой до последней, поля 6% по краям", () => {
    const result = milestoneTimeline(
      [
        milestone({ id: "m2", dueDate: "2026-01-11", status: "at_risk" }),
        milestone({
          id: "m1",
          dueDate: "2026-01-01",
          status: "done",
          sourceId: "src-1",
          location: "п. 4.2",
        }),
      ],
      project(),
      MIDDLE,
    );
    expect(result.from).toBe("2026-01-01");
    expect(result.to).toBe("2026-01-11");
    expect(result.points.map((p) => p.id)).toEqual(["m1", "m2"]);
    expect(result.points[0]?.offset).toBeCloseTo(0.06, 10);
    expect(result.points[1]?.offset).toBeCloseTo(0.94, 10); // 0,06 + 1 × 0,88
    expect(result.todayOffset).toBeCloseTo(0.5, 10); // 0,06 + 0,5 × 0,88
    expect(result.points[0]).toMatchObject({
      statusLabel: "Выполнено",
      sourceId: "src-1",
      location: "п. 4.2",
      past: true,
    });
    expect(result.points[1]?.statusLabel).toBe("Под риском");
  });

  test("в день срока точка ещё не прошла, на следующий день — прошла", () => {
    const past = (now: string) =>
      milestoneTimeline([milestone({ dueDate: "2026-01-06" })], project(), now).points[0]?.past;
    expect(past("2026-01-06T23:59:59")).toBe(false);
    expect(past("2026-01-07T00:00:00")).toBe(true);
  });

  test("сегодня раньше всех точек — ось начинается с сегодня", () => {
    // Ось 22.12–11.01 = 20 суток; 01.01 — середина: 0,06 + 0,5 × 0,88 = 0,5
    const result = milestoneTimeline(
      [
        milestone({ id: "m1", dueDate: "2026-01-01" }),
        milestone({ id: "m2", dueDate: "2026-01-11" }),
      ],
      project(),
      "2025-12-22T09:00:00",
    );
    expect(result.from).toBe("2025-12-22");
    expect(result.to).toBe("2026-01-11");
    expect(result.todayOffset).toBeCloseTo(0.06, 10);
    expect(result.points[0]?.offset).toBeCloseTo(0.5, 10);
    expect(result.points[1]?.offset).toBeCloseTo(0.94, 10);
  });

  test("сегодня позже всех точек — ось заканчивается сегодня", () => {
    const result = milestoneTimeline(
      [milestone({ dueDate: "2026-01-01" })],
      project(),
      "2026-01-21T10:00:00",
    );
    expect(result.from).toBe("2026-01-01");
    expect(result.to).toBe("2026-01-21");
    expect(result.todayOffset).toBeCloseTo(0.94, 10);
    expect(result.points[0]?.past).toBe(true);
  });

  test("точек нет — ось по срокам объекта", () => {
    const result = milestoneTimeline([], project(), MIDDLE);
    expect(result).toMatchObject({ points: [], from: START, to: END });
    expect(result.todayOffset).toBeCloseTo(0.5, 10);
  });

  test("точек нет и срок объекта прошёл — ось тянется до сегодня", () => {
    const result = milestoneTimeline([], project(), "2026-01-21T10:00:00");
    expect(result.from).toBe(START);
    expect(result.to).toBe("2026-01-21");
    // 20 суток, сегодня в конце: 0,94
    expect(result.todayOffset).toBeCloseTo(0.94, 10);
  });

  test("ось нулевой длины: единственная точка в день «сегодня» — посередине, «сегодня» неизвестно", () => {
    const result = milestoneTimeline([milestone({ dueDate: "2026-01-06" })], project(), MIDDLE);
    expect(result.from).toBe("2026-01-06");
    expect(result.to).toBe("2026-01-06");
    expect(result.points[0]?.offset).toBe(0.5);
    expect(result.todayOffset).toBeNull();
  });

  test("исходный список не пересортировывается", () => {
    const input = [
      milestone({ id: "b", dueDate: "2026-01-09" }),
      milestone({ id: "a", dueDate: "2026-01-02" }),
    ];
    milestoneTimeline(input, project(), MIDDLE);
    expect(input.map((m) => m.id)).toEqual(["b", "a"]);
  });
});

/* ---------- Метрики «Хода работ» ---------- */

describe("progressMetrics", () => {
  const base = { timeline: timeline([]), contract: contract(), now: MIDDLE };

  test("выполнено и отклонение: сумма факта к сумме плана минус доля срока", () => {
    // (30 + 50) / (100 + 100) = 40%; 40 − 50 = −10
    const list = progressMetrics({
      ...base,
      zones: [
        zoneRow({ id: "a", planQty: 100, factQty: 30, donePct: 30, planPct: 50, deviationPp: -20 }),
        zoneRow({ id: "b", planQty: 100, factQty: 50, donePct: 50, planPct: 50, deviationPp: 0 }),
      ],
    });
    const done = byKey(list, "done");
    expect(done.value).toBe("40%");
    expect(done.note).toBe("80 из 200 м²");
    expect(done.filter).toBe("all");
    expect(done.explain.sources[0]?.label).toBe("Захватки объекта: 2");
    const deviation = byKey(list, "deviation");
    expect(deviation.value).toBe("−10 п. п.");
    expect(deviation.filter).toBe("behind");
  });

  test("отклонение со знаком плюс и без знака на нуле", () => {
    const value = (factQty: number) =>
      byKey(
        progressMetrics({ ...base, zones: [zoneRow({ planQty: 100, factQty, planPct: 50 })] }),
        "deviation",
      ).value;
    expect(value(60)).toBe("+10 п. п.");
    expect(value(50)).toBe("0 п. п.");
  });

  test("перевыполнение захватки не завышает готовность объекта (как в сводке дашборда)", () => {
    // Факт ограничен планом: min(150, 100) + 0 = 100 из 200 = 50%, а не 150 / 200 = 75%
    const list = progressMetrics({
      ...base,
      zones: [
        zoneRow({
          id: "a",
          planQty: 100,
          factQty: 150,
          donePct: 100,
          planPct: 50,
          deviationPp: 50,
        }),
        zoneRow({ id: "b", planQty: 100, factQty: 0, donePct: 0, planPct: 50, deviationPp: -50 }),
      ],
    });
    expect(byKey(list, "done").value).toBe("50%");
  });

  test("доля срока неизвестна — отклонение «—»", () => {
    const list = progressMetrics({
      ...base,
      zones: [zoneRow({ planPct: null, deviationPp: null })],
    });
    expect(byKey(list, "deviation").value).toBe("—");
  });

  test("захваток нет — 0%, «0 из 0 ед.», отклонение «—»", () => {
    const list = progressMetrics({ ...base, zones: [] });
    expect(byKey(list, "done").value).toBe("0%");
    expect(byKey(list, "done").note).toBe("0 из 0 ед.");
    expect(byKey(list, "deviation").value).toBe("—");
  });

  test("источник отклонения — договор с номером и сроками; без договора — общий ярлык", () => {
    const withContract = byKey(progressMetrics({ ...base, zones: [] }), "deviation");
    expect(withContract.explain.sources).toEqual([
      { label: "Договор Д-1", hint: "сроки 2026-01-01 — 2026-01-11", sourceId: "src-k" },
    ]);
    const without = byKey(progressMetrics({ ...base, contract: null, zones: [] }), "deviation");
    expect(without.explain.sources).toEqual([
      { label: "Договор объекта", hint: undefined, sourceId: null },
    ]);
  });

  test("ближайшая точка — первая непрошедшая; дней до неё — от сегодняшней даты", () => {
    // 20.01 − 06.01 = 14 суток; время внутри дня не влияет
    const list = progressMetrics({
      ...base,
      now: "2026-01-06T15:30:00",
      zones: [],
      timeline: timeline([
        point({ id: "m0", dueDate: "2026-01-03", past: true }),
        point({
          id: "m1",
          name: "Этап 2",
          dueDate: "2026-01-20",
          location: "п. 5.1",
          sourceId: "src-m1",
          requirement: "Сдать секцию 1",
        }),
        point({ id: "m2", dueDate: "2026-02-10" }),
      ]),
    });
    const next = byKey(list, "next");
    expect(next.value).toBe("20.01.2026");
    expect(next.note).toBe("Этап 2");
    expect(next.milestoneId).toBe("m1");
    expect(next.filter).toBeNull();
    expect(next.explain.sources).toEqual([{ label: "Этап 2", hint: "п. 5.1", sourceId: "src-m1" }]);
    const days = byKey(list, "days");
    expect(days.value).toBe("14");
    expect(days.milestoneId).toBe("m1");
    expect(days.explain.sources).toEqual([
      { label: "Этап 2", hint: "Сдать секцию 1", sourceId: "src-m1" },
    ]);
  });

  test("точка со сроком сегодня — 0 дней; завтра — 1 день даже поздно вечером", () => {
    const days = (dueDate: string, now: string) =>
      byKey(
        progressMetrics({ ...base, now, zones: [], timeline: timeline([point({ dueDate })]) }),
        "days",
      ).value;
    expect(days("2026-01-06", "2026-01-06T08:00:00")).toBe("0");
    expect(days("2026-01-07", "2026-01-06T23:59:59")).toBe("1");
  });

  test("все точки прошли или их нет — «нет», «—», ссылки на точку нет", () => {
    for (const points of [[], [point({ past: true })]]) {
      const list = progressMetrics({ ...base, zones: [], timeline: timeline(points) });
      const next = byKey(list, "next");
      const days = byKey(list, "days");
      expect(next.value).toBe("нет");
      expect(next.note).toBeUndefined();
      expect("milestoneId" in next).toBe(false);
      expect(next.explain.sources).toEqual([{ label: "Контрольные точки договора не извлечены" }]);
      expect(days.value).toBe("—");
      expect("milestoneId" in days).toBe(false);
      expect(days.explain.sources).toEqual([{ label: "Контрольных точек нет" }]);
    }
  });

  test("четыре метрики в порядке экрана", () => {
    const list: ProgressMetric[] = progressMetrics({ ...base, zones: [] });
    expect(list.map((item) => item.key)).toEqual(["done", "deviation", "next", "days"]);
  });
});

/* ---------- Команда ---------- */

describe("teamRows", () => {
  const people = [
    {
      id: "e-gareev",
      name: "Гареев",
      position: "Прораб",
      role: "foreman",
      phone: "+7 900 000-00-01",
      telegram: "@gareev",
      projectIds: ["p-1", "p-2"],
    },
    {
      id: "e-kim",
      name: "Ким",
      position: "Инженер ПТО",
      role: "pto",
      phone: "+7 900 000-00-02",
      telegram: null,
      projectIds: ["p-1"],
    },
  ];
  const crews = [
    {
      id: "cr-1",
      name: "Бригада 1",
      foremanId: "e-gareev",
      headcount: 8,
      specialization: "Облицовка",
    },
    {
      id: "cr-2",
      name: "Бригада 2",
      foremanId: "e-none",
      headcount: 6,
      specialization: "Подсистема",
    },
  ];
  const zones = [zone({ id: "z-1", name: "Захватка 1" }), zone({ id: "z-2", name: "Захватка 2" })];

  test("человек: последний отчёт по времени, бригада, где он прораб, число объектов", () => {
    const result = teamRows({
      people,
      crews,
      zones,
      reports: [
        report({ id: "a", authorId: "e-gareev", zoneId: "z-1", sentAt: "2026-01-04T10:00:00" }),
        report({
          id: "b",
          authorId: "e-gareev",
          zoneId: "z-2",
          sentAt: "2026-01-05T10:00:00",
          status: "accepted",
        }),
        report({ id: "c", authorId: "e-gareev", zoneId: "z-1", sentAt: "2026-01-03T10:00:00" }),
      ],
    });
    expect(result.people[0]).toEqual({
      id: "e-gareev",
      name: "Гареев",
      position: "Прораб",
      role: "foreman",
      phone: "+7 900 000-00-01",
      telegram: "@gareev",
      crewName: "Бригада 1",
      lastReport: { at: "2026-01-05T10:00:00", zoneName: "Захватка 2", status: "accepted" },
      projectCount: 2,
    });
    expect(result.people[1]?.crewName).toBeNull();
    expect(result.people[1]?.lastReport).toBeNull();
    expect(result.people[1]?.projectCount).toBe(1);
  });

  test("бригада: прораб по имени, захватка последнего отчёта; неизвестные — «—»", () => {
    const result = teamRows({
      people,
      crews,
      zones,
      reports: [
        report({ crewId: "cr-1", zoneId: "z-1", sentAt: "2026-01-05T09:00:00" }),
        report({ crewId: "cr-1", zoneId: "z-9", sentAt: "2026-01-05T12:00:00" }),
      ],
    });
    expect(result.crews).toEqual([
      {
        id: "cr-1",
        name: "Бригада 1",
        foremanName: "Гареев",
        headcount: 8,
        specialization: "Облицовка",
        lastZone: { id: "z-9", name: "—", at: "2026-01-05T12:00:00" },
      },
      {
        id: "cr-2",
        name: "Бригада 2",
        foremanName: "—",
        headcount: 6,
        specialization: "Подсистема",
        lastZone: null,
      },
    ]);
  });

  test("пустые списки — пустая команда", () => {
    expect(teamRows({ people: [], crews: [], reports: [], zones: [] })).toEqual({
      people: [],
      crews: [],
    });
  });
});

describe("silentCrews", () => {
  // Сейчас 18.09 12:00; граница «7 дней» — 11.09 12:00
  const now = "2026-09-18T12:00:00";

  test("отчёт ровно 7 суток назад — бригада не молчит; на секунду раньше — молчит", () => {
    const crews = [
      crew({ id: "edge", lastZone: lastAt("2026-09-11T12:00:00") }),
      crew({ id: "over", lastZone: lastAt("2026-09-11T11:59:59") }),
      crew({ id: "six", lastZone: lastAt("2026-09-12T12:00:00") }),
      crew({ id: "never", lastZone: null }),
    ];
    expect(silentCrews(crews, now).map((c) => c.id)).toEqual(["over", "never"]);
  });

  test("порог в днях задаётся: 3 дня", () => {
    // Граница — 15.09 12:00
    const crews = [
      crew({ id: "a", lastZone: lastAt("2026-09-15T12:00:00") }),
      crew({ id: "b", lastZone: lastAt("2026-09-15T11:00:00") }),
    ];
    expect(silentCrews(crews, now, 3).map((c) => c.id)).toEqual(["b"]);
  });

  test("нет бригад — никто не молчит", () => {
    expect(silentCrews([], now)).toEqual([]);
  });

  test("граница не зависит от часового пояса машины (UTC+8)", () => {
    // Отметки — местное время: 7 сут. 2 ч назад — молчит, 6 сут. 23 ч назад — нет
    inTimeZone("Asia/Makassar", () => {
      const crews = [
        crew({ id: "late", lastZone: lastAt("2026-09-11T10:00:00") }),
        crew({ id: "fresh", lastZone: lastAt("2026-09-11T13:00:00") }),
      ];
      expect(silentCrews(crews, now).map((c) => c.id)).toEqual(["late"]);
    });
  });
});

describe("teamMetrics", () => {
  const now = "2026-09-18T12:00:00";

  test("люди, прорабы, бригады и численность", () => {
    const list: TeamMetric[] = teamMetrics({
      now,
      people: [person({ id: "a" }), person({ id: "b" }), person({ id: "c", role: "pto" })],
      crews: [
        crew({ id: "x", headcount: 8, lastZone: lastAt("2026-09-17T10:00:00") }),
        crew({ id: "y", headcount: 13, lastZone: lastAt("2026-09-16T10:00:00") }),
      ],
    });
    expect(list.map((item) => [item.key, item.value, item.filter])).toEqual([
      ["people", "3", "all"],
      ["crews", "2", null],
      ["silent", "0", "silent"],
    ]);
    expect(byKey(list, "people").explain.sources[0]?.label).toBe("Прорабов: 2");
    expect(byKey(list, "crews").explain.sources[0]?.label).toBe("Людей в бригадах: 21"); // 8 + 13
    expect(byKey(list, "silent").explain.sources).toEqual([{ label: "Все бригады отчитались" }]);
  });

  test("молчащие бригады за 7 дней перечислены с датой последнего отчёта или без отчётов", () => {
    const list = teamMetrics({
      now,
      people: [],
      crews: [
        crew({ id: "x", name: "Бригада 1", lastZone: lastAt("2026-09-10T18:00:00") }),
        crew({ id: "y", name: "Бригада 2", lastZone: null }),
        crew({ id: "z", name: "Бригада 3", lastZone: lastAt("2026-09-11T12:00:00") }),
      ],
    });
    const silent = byKey(list, "silent");
    expect(silent.value).toBe("2");
    expect(silent.explain.sources).toEqual([
      { label: "Бригада 1", hint: "последний отчёт 2026-09-10" },
      { label: "Бригада 2", hint: "отчётов не было" },
    ]);
  });

  test("пустая команда — нули", () => {
    const list = teamMetrics({ now, people: [], crews: [] });
    expect(list.map((item) => item.value)).toEqual(["0", "0", "0"]);
    expect(byKey(list, "people").explain.sources[0]?.label).toBe("Прорабов: 0");
  });
});
