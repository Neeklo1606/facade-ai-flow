import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo, weekReasons } from "@/adapters/gas-ops/demo";
import { getSnapshot, resetState } from "@/adapters/gas-ops/state";
import {
  crewOn,
  crewSummary,
  defaultHeadcount,
  laborCostOf,
  manMinutesOf,
  personRows,
  rateOn,
  type CrewMember,
  type Rate,
} from "@/domain/gas-ops/crew";
import {
  blockingReasons,
  closeReasons,
  coverage,
  expectations,
  periodState,
  weekMetrics,
} from "@/domain/gas-ops/week";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { GasOpsError } from "@/ports/gas-ops";

/**
 * Учёт времени бригад v1 (ADR-056): состав, человеко-часы, ставки, неделя и её версии,
 * выборка бригадира без финансов. Инварианты раздела 1.4 — по номерам в названиях тестов.
 */

function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: "e1",
    number: "ГЗ-1",
    day: "2026-10-01",
    brigadeId: "b1",
    employeeId: null,
    objectId: "o1",
    startMinutes: 8 * 60,
    endMinutes: 17 * 60,
    breakMinutes: 60,
    minutes: 480,
    amountRub: null,
    status: "confirmed",
    createdBy: "u",
    createdAt: "2026-10-01T18:00:00",
    reviewedBy: "m",
    reviewedAt: "2026-10-01T19:00:00",
    comment: null,
    source: "mock",
    ...over,
  };
}

const member = (over: Partial<CrewMember>): CrewMember => ({
  id: "c",
  brigadeId: "b1",
  employeeId: "p",
  name: "Человек",
  role: "worker",
  from: null,
  to: null,
  source: "mock",
  ...over,
});

const rate = (over: Partial<Rate>): Rate => ({
  id: "r",
  employeeId: null,
  brigadeId: "b1",
  rubPerHour: 500,
  from: "2026-09-01",
  to: null,
  source: "mock",
  ...over,
});

async function errorCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof GasOpsError ? error.code : "unknown";
  }
}

describe("состав и человеко-часы (1.2)", () => {
  test("человеко-часы: число людей × минуты записи", () => {
    expect(manMinutesOf(entry({ headcount: 5 }))).toBe(2400);
    expect(crewSummary(entry({ headcount: 5 }))).toBe(
      "5 чел., по 8\u00a0ч на человека, всего 40\u00a0чел.-ч",
    );
  });

  test("строки людей: сумма их минут, а не минуты записи × число", () => {
    const rows = personRows([
      { employeeId: "a", start: "8:00", end: "17:00", breakMinutes: 60 },
      { employeeId: "b", start: "8:00", end: "12:00", breakMinutes: 0 },
    ]);
    expect(rows.ok).toBe(true);
    if (!rows.ok) return;
    expect(manMinutesOf(entry({ people: rows.people, headcount: null }))).toBe(480 + 240);
  });

  test("строка человека с ошибкой времени называет номер строки", () => {
    const rows = personRows([
      { employeeId: "a", start: "8:00", end: "17:00", breakMinutes: 0 },
      { employeeId: "b", start: "12:00", end: "9:00", breakMinutes: 0 },
    ]);
    expect(rows).toMatchObject({ ok: false, index: 1 });
  });

  test("состав неизвестен (строка выгрузки) — человеко-часов нет, не равны часам", () => {
    expect(manMinutesOf(entry({ headcount: null }))).toBeNull();
    expect(manMinutesOf(entry({}))).toBeNull();
    expect(crewSummary(entry({ headcount: null }))).toBe("Состав не указан");
  });

  test("состав на дату учитывает период действия", () => {
    const crew = [
      member({ id: "1" }),
      member({ id: "2", from: "2026-10-02" }),
      member({ id: "3", to: "2026-09-30" }),
      member({ id: "4", brigadeId: "b2" }),
    ];
    expect(crewOn(crew, "b1", "2026-10-01").map((m) => m.id)).toEqual(["1"]);
    expect(crewOn(crew, "b1", "2026-10-02").map((m) => m.id)).toEqual(["1", "2"]);
    expect(defaultHeadcount(crew, "b3", "2026-10-01")).toBeNull();
  });
});

describe("ставки и стоимость труда (1.2, инвариант 8)", () => {
  test("без ставок стоимость труда null, а не ноль", () => {
    expect(laborCostOf(entry({ headcount: 4 }), [])).toBeNull();
    expect(weekMetrics([entry({ headcount: 4 })], ["2026-10-01"], []).laborCostRub).toBeNull();
  });

  test("человеко-часы × ставка бригады", () => {
    expect(laborCostOf(entry({ headcount: 4 }), [rate({})])).toBe(32 * 500);
  });

  test("ставка человека важнее ставки бригады, период ставки соблюдается", () => {
    const rates = [
      rate({ id: "b" }),
      rate({ id: "p", employeeId: "a", brigadeId: null, rubPerHour: 700 }),
      rate({ id: "old", employeeId: "a", brigadeId: null, from: "2026-01-01", to: "2026-08-31" }),
    ];
    expect(rateOn(rates, { employeeId: "a", brigadeId: "b1" }, "2026-10-01")?.id).toBe("p");
    expect(rateOn(rates, { employeeId: "x", brigadeId: "b1" }, "2026-10-01")?.id).toBe("b");
    expect(rateOn(rates, { employeeId: null, brigadeId: "b1" }, "2026-08-01")).toBeNull();
  });

  test("не хватает ставки одному человеку — стоимость не частичная, а null", () => {
    const rows = personRows([
      { employeeId: "a", start: "8:00", end: "12:00", breakMinutes: 0 },
      { employeeId: "b", start: "8:00", end: "12:00", breakMinutes: 0 },
    ]);
    if (!rows.ok) throw new Error("rows");
    const e = entry({ people: rows.people, brigadeId: "b9" });
    const onlyA = [rate({ employeeId: "a", brigadeId: null })];
    expect(laborCostOf(e, onlyA)).toBeNull();
  });
});

describe("показатели недели (инвариант 1)", () => {
  const days = ["2026-10-01", "2026-10-02"];
  const list = [
    entry({ id: "1", amountRub: 10_000, headcount: 2 }),
    entry({ id: "2", amountRub: 5_000, status: "pending", headcount: 2 }),
    entry({ id: "3", amountRub: 6_000, headcount: null, day: "2026-10-02", minutes: 240 }),
    entry({ id: "4", amountRub: 9_000, day: "2026-10-09" }),
  ];

  test("в итог идёт только подтверждённое и только своей недели", () => {
    const m = weekMetrics(list, days, []);
    expect(m.accruedRub).toBe(16_000);
    expect(m.minutes).toBe(720);
    expect(m.pending).toBe(1);
  });

  test("выработка на человеко-час — только по записям с составом", () => {
    const m = weekMetrics(list, days, []);
    expect(m.manMinutes).toBe(960);
    expect(m.withoutCrew).toBe(1);
    expect(m.outputPerManHour).toBe(Math.round(10_000 / 16));
    expect(m.outputPerHour).toBe(Math.round(16_000 / 12));
  });
});

describe("полнота недели и причины до закрытия", () => {
  const input = {
    days: ["2026-10-01"],
    brigades: [{ id: "b1", code: "Б1", name: "Бригада 1" }],
    objects: [{ id: "o1", code: "ОБ-1", label: "Объект 1" }],
    assignments: [
      { brigadeId: "b1", day: "2026-10-01", objectIds: ["o1", "o2"], source: "mock" as const },
    ],
  };

  test("без графика ожидание берётся из демо-назначений и помечено их источником", () => {
    const list = expectations({ ...input, schedule: null });
    expect(list.map((x) => x.source)).toEqual(["assignment", "assignment"]);
    const c = coverage(list, [entry({})]);
    expect(c).toMatchObject({ received: 1, expected: 2 });
    expect(c.missing[0]?.objectId).toBe("o2");
  });

  test("график заказчика, если загружен, заменяет назначения", () => {
    const list = expectations({
      ...input,
      schedule: {
        rows: [
          {
            key: "k",
            objectLabel: "Объект 1",
            code: null,
            brigade: "Б1",
            day: "2026-10-01",
            row: 2,
          },
        ],
      },
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.source).toBe("schedule");
  });

  test("непроверенное принять как есть нельзя; остальное — только с причиной", () => {
    const reasons = closeReasons({
      days: ["2026-10-01"],
      entries: [
        entry({ id: "p", status: "pending" }),
        entry({
          id: "n",
          amountRub: 1,
          startMinutes: 18 * 60,
          endMinutes: 19 * 60,
          breakMinutes: 0,
          minutes: 60,
        }),
      ],
      estimates: [],
      objects: input.objects,
      brigades: input.brigades,
      crew: [],
      finalChecks: [],
      missing: [],
    });
    expect(reasons.map((r) => r.kind)).toEqual(["pending", "no-estimate"]);
    const all = reasons.map((r) => ({ key: r.key, reason: "Согласовано" }));
    expect(blockingReasons(reasons, all).map((r) => r.kind)).toEqual(["pending"]);
    const noReason = [{ key: "no-estimate|o1", reason: "  " }];
    expect(blockingReasons(reasons.slice(1), noReason)).toHaveLength(1);
  });
});

describe("порт: отправка, уточнение, неделя (инварианты 2–5)", () => {
  const port = createGasOpsDemo();

  beforeEach(async () => {
    resetState();
    await port.signIn("u-foreman-1");
  });

  async function place() {
    const field = await port.fieldSnapshot();
    const objectId = field.allowedObjects.find(
      (o) => !field.entries.some((e) => e.objectId === o.id && e.day === field.today),
    )!.id;
    return { field, objectId };
  }

  test("4: повтор отправки с тем же ключом возвращает ту же запись", async () => {
    const { field, objectId } = await place();
    const input = {
      day: field.today,
      brigadeId: "brg-1",
      employeeId: null,
      objectId,
      start: "6:00",
      end: "7:30",
      breakMinutes: 0,
      submit: true,
      clientKey: "phone-1",
    };
    const first = await port.createEntry(input);
    const again = await port.createEntry(input);
    expect(again.id).toBe(first.id);
    expect(getSnapshot().entries.filter((e) => e.clientKey === "phone-1")).toHaveLength(1);
    expect(first.channel).toBe("web");
    expect(first.headcount).toBe(4);
  });

  test("5: выборка бригадира без сумм, смет, ставок и чужих бригад", async () => {
    const field = await port.fieldSnapshot("brg-2");
    expect(field.brigade?.id).toBe("brg-1");
    const text = JSON.stringify(field);
    for (const word of ["amountRub", "rubPerHour", "estimate", "revenue", "₽"]) {
      expect(text).not.toContain(word);
    }
    const own = new Set(
      getSnapshot()
        .entries.filter((e) => e.brigadeId === "brg-1")
        .map((e) => e.id),
    );
    expect(field.entries.every((e) => own.has(e.id))).toBe(true);
    expect(field.crew.length).toBe(4);
  });

  test("ответ на уточнение возвращает запись на проверку и пишется в историю", async () => {
    await port.signIn("u-manager");
    const target = getSnapshot().entries.find(
      (e) => e.status === "pending" && e.brigadeId === "brg-1",
    )!;
    await port.review({ id: target.id, action: "clarify", comment: "Сколько было людей?" });
    await port.signIn("u-foreman-1");
    const field = await port.fieldSnapshot();
    expect(field.entries.find((e) => e.id === target.id)?.question).toBe("Сколько было людей?");
    const answered = await port.answerClarify({ id: target.id, text: "Четверо" });
    expect(answered.status).toBe("pending");
    expect(getSnapshot().reviews[0]).toMatchObject({ action: "answer", comment: "Четверо" });
  });

  test("2: правка состава подтверждённой записи требует причины и остаётся в истории", async () => {
    await port.signIn("u-manager");
    const target = getSnapshot().entries.find((e) => e.status === "pending")!;
    await port.review({ id: target.id, action: "confirm" });
    expect(await errorCode(() => port.updateEntry({ id: target.id, headcount: 2 }))).toBe(
      "comment-required",
    );
    await port.updateEntry({ id: target.id, headcount: 2, comment: "Двое ушли на другой объект" });
    const history = getSnapshot().reviews.filter((r) => r.entryId === target.id);
    expect(history[0]?.changes).toContainEqual({
      field: "Состав",
      from: `${target.headcount} чел.`,
      to: "2 чел.",
    });
    expect(history).toHaveLength(2);
  });

  test("закрыть неделю нельзя, пока есть непроверенное; бригадир и менеджер не закрывают", async () => {
    expect(await errorCode(() => port.closeWeek({ accepted: [] }))).toBe("not-allowed");
    await port.signIn("u-manager");
    expect(await errorCode(() => port.closeWeek({ accepted: [] }))).toBe("not-allowed");
    await port.signIn("u-director");
    expect(await errorCode(() => port.closeWeek({ accepted: [] }))).toBe("close-blocked");
  });

  test("3: закрытие даёт v1, закрытая неделя не меняется, переоткрытие с причиной даёт v2", async () => {
    await clearWeek(port);
    await port.signIn("u-director");
    const accepted = weekReasons(getSnapshot()).map((r) => ({
      key: r.key,
      reason: "Принято как есть",
    }));
    const v1 = await port.closeWeek({ accepted });
    expect(v1.version).toBe(1);
    const total = getSnapshot()
      .entries.filter((e) => e.status === "confirmed" && getSnapshot().week.days.includes(e.day))
      .reduce((a, e) => a + (e.amountRub ?? 0), 0);
    expect(v1.totals.accruedRub).toBe(total);

    await port.signIn("u-manager");
    const some = getSnapshot().entries.find((e) => e.status === "confirmed")!;
    expect(
      await errorCode(() => port.updateEntry({ id: some.id, headcount: 1, comment: "поздно" })),
    ).toBe("period-closed");
    expect(await errorCode(() => port.undoReview(some.id))).toBe("period-closed");
    expect(
      await errorCode(() =>
        port.createEntry({
          day: getSnapshot().today,
          brigadeId: "brg-1",
          employeeId: null,
          objectId: "obj-m1",
          start: "5:00",
          end: "6:00",
          breakMinutes: 0,
          submit: true,
        }),
      ),
    ).toBe("period-closed");

    await port.signIn("u-director");
    expect(await errorCode(() => port.reopenWeek({ reason: " " }))).toBe("comment-required");
    await port.reopenWeek({ reason: "Заказчик прислал исправленный график" });
    const state = periodState(getSnapshot().periods, getSnapshot().week.from);
    expect(state.closed).toBeNull();
    expect(state.versions[0]?.entries.length).toBe(v1.entries.length);

    const v2 = await port.closeWeek({ accepted });
    expect(v2.version).toBe(2);
    const after = periodState(getSnapshot().periods, getSnapshot().week.from);
    expect(after.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(after.versions[0]?.reopenReason).toBe("Заказчик прислал исправленный график");
  });
});

/** Менеджер решает всё, что ждёт: остальное руководитель принимает как есть с причиной */
async function clearWeek(port: ReturnType<typeof createGasOpsDemo>) {
  await port.signIn("u-manager");
  for (const e of getSnapshot().entries) {
    if (e.status === "pending" || e.status === "clarify") {
      await port.review({ id: e.id, action: "reject", comment: "Не подтверждено в демо" });
    }
  }
  await port.finalCheck();
}
