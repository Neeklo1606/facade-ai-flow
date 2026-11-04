import { describe, expect, test } from "bun:test";
import type { Review, TimeEntry } from "@/domain/gas-ops/model";
import {
  brigadeStatus,
  setBrigadeStatus,
  workingBrigades,
  type ScheduleRow,
} from "@/domain/gas-ops/schedule";
import { dayOf, diffSchedule, guessHeader, readSchedule } from "@/domain/gas-ops/schedule-import";
import {
  ACCURACY_MIN_SAMPLE,
  AUTO_ACTOR,
  DEFAULT_REVIEW_SETTINGS,
  accuracyOf,
  flaggedModeSuggestion,
  isAutoAccepted,
  finalCheckList,
  modeAvailability,
  routeEntry,
} from "@/domain/gas-ops/review-policy";

/** Недельный график, доступность бригад и режимы проверки (ADR-053, разделы 4 и 5) */

describe("недельный график", () => {
  const grid = [
    ["График работ на неделю"],
    ["Дата", "№", "Объект", "Бригада"],
    [46322, "ОБ-101", "Развилка, ввод", "Б-1"],
    ["27.10.2026", "ОБ-102", "Ольховка, перемонтаж", "Б-2"],
    ["28.10.2026", null, "Котёл, частный дом", "Б-1"],
    ["когда-нибудь", "ОБ-103", "Без даты", "Б-3"],
    [null, null, null, null],
  ];

  test("заголовок и колонки угадываются по подписям", () => {
    expect(guessHeader(grid)).toEqual({ row: 1, map: { day: 0, code: 1, object: 2, brigade: 3 } });
  });

  test("даты Excel и строки, непонятный день уходит в замечания с номером строки", () => {
    expect(dayOf(46322)).toBe("2026-10-27");
    expect(dayOf("2026-10-27")).toBe("2026-10-27");
    const { rows, skipped } = readSchedule(grid, 1, { day: 0, code: 1, object: 2, brigade: 3 });
    expect(rows.map((r) => [r.code, r.day, r.row])).toEqual([
      ["ОБ-101", "2026-10-27", 3],
      ["ОБ-102", "2026-10-27", 4],
      [null, "2026-10-28", 5],
    ]);
    expect(skipped).toEqual([{ row: 6, reason: "день не распознан" }]);
  });

  test("без обязательной колонки строки не читаются, причина названа", () => {
    const { rows, skipped } = readSchedule(grid, 1, { day: 0, code: 1, object: null, brigade: 3 });
    expect(rows).toEqual([]);
    expect(skipped[0]!.reason).toContain("Объект");
  });

  test("предпросмотр: добавится, изменится, уйдёт", () => {
    const row = (code: string, brigade: string, day: string): ScheduleRow => ({
      key: `${code.toLowerCase()}|${brigade.toLowerCase()}|${day}`,
      objectLabel: code,
      code,
      brigade,
      day,
      row: 1,
    });
    const current = [row("ОБ-1", "Б-1", "d1"), row("ОБ-2", "Б-2", "d1"), row("ОБ-3", "Б-3", "d1")];
    const next = [row("ОБ-1", "Б-1", "d1"), row("ОБ-2", "Б-5", "d1"), row("ОБ-4", "Б-4", "d2")];
    const diff = diffSchedule(current, next);
    expect(diff.unchanged).toBe(1);
    expect(diff.added.map((r) => r.code)).toEqual(["ОБ-4"]);
    expect(diff.changed.map((c) => [c.from.brigade, c.to.brigade])).toEqual([["Б-2", "Б-5"]]);
    expect(diff.removed.map((r) => r.code)).toEqual(["ОБ-3"]);
  });
});

describe("бригады на неделю", () => {
  const brigades = [{ id: "b1" }, { id: "b2" }];
  test("по умолчанию работает; в отпуске не видна графику и боту", () => {
    const list = setBrigadeStatus([], {
      brigadeId: "b2",
      weekFrom: "2026-10-26",
      status: "vacation",
    });
    expect(brigadeStatus("b1", "2026-10-26", list)).toBe("working");
    expect(workingBrigades(brigades, "2026-10-26", list).map((b) => b.id)).toEqual(["b1"]);
    // Отметка действует только на свою неделю
    expect(workingBrigades(brigades, "2026-11-02", list)).toHaveLength(2);
    const back = setBrigadeStatus(list, {
      brigadeId: "b2",
      weekFrom: "2026-10-26",
      status: "working",
    });
    expect(back).toHaveLength(1);
    expect(workingBrigades(brigades, "2026-10-26", back)).toHaveLength(2);
  });
});

describe("режимы проверки", () => {
  const review = (i: number, action: Review["action"], entryId = `e${i}`): Review => ({
    id: `r${i}-${action}`,
    entryId,
    action,
    actor: "u-manager",
    at: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T10:${String(i % 60).padStart(2, "0")}:00.000Z`,
    comment: null,
    changes: [],
  });

  test("точность: решения человека, правка делает запись не чистой", () => {
    const reviews = [
      ...Array.from({ length: 19 }, (_, i) => review(i, "confirm")),
      review(100, "correct", "e100"),
      review(101, "confirm", "e100"),
    ];
    const acc = accuracyOf(reviews);
    expect(acc).toEqual({ decided: 20, clean: 19, percent: 95 });
  });

  test("режим без проверки недоступен, пока не набран порог, с объяснением", () => {
    const few = accuracyOf([review(1, "confirm")]);
    const a = modeAvailability("none", few, 95);
    expect(a.ok).toBe(false);
    expect(!a.ok && a.reason).toContain(String(ACCURACY_MIN_SAMPLE));
    const low = { decided: 20, clean: 18, percent: 90 };
    expect(modeAvailability("none", low, 95).ok).toBe(false);
    expect(modeAvailability("none", { decided: 20, clean: 19, percent: 95 }, 95).ok).toBe(true);
    expect(modeAvailability("flagged", few, 95).ok).toBe(true);
  });

  test("предложение «только с замечаниями»: после двух недель и 95% за 50 решений", () => {
    const reviews = Array.from({ length: 50 }, (_, i) => review(i, "confirm"));
    const accuracy = accuracyOf(reviews);
    const settings = DEFAULT_REVIEW_SETTINGS;
    const first = reviews.map((r) => r.at).sort()[0]!;
    const after = (days: number) => new Date(Date.parse(first) + days * 86_400_000).toISOString();
    expect(flaggedModeSuggestion({ settings, accuracy, reviews, now: after(13) })).toBeNull();
    expect(flaggedModeSuggestion({ settings, accuracy, reviews, now: after(14) })).toEqual({
      percent: 100,
      decided: 50,
    });
    // Окно не полное: 49 решений — рано
    const few = reviews.slice(1);
    expect(
      flaggedModeSuggestion({ settings, accuracy: accuracyOf(few), reviews: few, now: after(30) }),
    ).toBeNull();
    // Точность ниже 95%: 3 правки из 50
    const rough = [...reviews.slice(0, 47), ...[200, 201, 202].map((i) => review(i, "reject"))];
    expect(accuracyOf(rough).percent).toBe(94);
    expect(
      flaggedModeSuggestion({
        settings,
        accuracy: accuracyOf(rough),
        reviews: rough,
        now: after(30),
      }),
    ).toBeNull();
    // Режим уже не «все»: предлагать нечего
    expect(
      flaggedModeSuggestion({
        settings: { ...settings, mode: "flagged" },
        accuracy,
        reviews,
        now: after(30),
      }),
    ).toBeNull();
  });

  test("принята автоматически: только подтверждённая системой", () => {
    expect(isAutoAccepted({ status: "confirmed", reviewedBy: AUTO_ACTOR })).toBe(true);
    expect(isAutoAccepted({ status: "confirmed", reviewedBy: "u-manager" })).toBe(false);
    expect(isAutoAccepted({ status: "pending", reviewedBy: AUTO_ACTOR })).toBe(false);
  });

  test("маршрут записи по режиму", () => {
    expect(routeEntry("all", [])).toBe("queue");
    expect(routeEntry("flagged", [])).toBe("auto");
    expect(routeEntry("flagged", ["overlap"])).toBe("queue");
    expect(routeEntry("none", ["overlap"])).toBe("auto");
    // «Объект на несколько дней» — сведение, не замечание: автоприём не держит
    expect(routeEntry("flagged", ["multi-day-object"])).toBe("auto");
    expect(routeEntry("flagged", ["multi-day-object", "no-estimate"])).toBe("queue");
    expect(routeEntry("flagged", ["over-crew"])).toBe("queue");
  });

  test("итоговая проверка: записи недели без ручного подтверждения, ещё не проверенные", () => {
    const e = (id: string, over: Partial<TimeEntry>) =>
      ({ id, day: "d1", status: "confirmed", reviewedBy: AUTO_ACTOR, ...over }) as TimeEntry;
    const entries = [
      e("a", {}),
      e("b", { reviewedBy: "u-manager" }),
      e("c", { status: "pending" }),
      e("d", { day: "d9" }),
      e("f", {}),
    ];
    const list = finalCheckList(
      entries,
      [{ id: "c1", week: "w", at: "t", by: "u", entryIds: ["f"] }],
      ["d1"],
    );
    expect(list.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("бот бригадира берёт объекты из графика", () => {
  test("график главнее назначений демо, бригада в отпуске объектов не получает", async () => {
    const { dayObjects } = await import("@/domain/gas-ops/view");
    const objects = [
      {
        id: "o1",
        code: "ОБ-1",
        label: "Развилка, ввод",
        settlement: null,
        workType: null,
        source: "mock" as const,
      },
      {
        id: "o2",
        code: "ОБ-2",
        label: "Ольховка",
        settlement: null,
        workType: null,
        source: "mock" as const,
      },
    ];
    const brigades = [
      {
        id: "b1",
        groupId: "g",
        name: "Бригада 1",
        code: "Б-1",
        excelRow: null,
        source: "mock" as const,
        phone: null,
      },
    ];
    const week = { from: "2026-10-26", to: "2026-11-01", days: ["2026-10-27"] };
    const assignments = [
      { brigadeId: "b1", day: "2026-10-27", objectIds: ["o1"], source: "mock" as const },
    ];
    const schedule = {
      rows: [
        {
          key: "k",
          objectLabel: "Ольховка",
          code: "ОБ-2",
          brigade: "б-1",
          day: "2026-10-27",
          row: 3,
        },
      ],
    };
    const base = { objects, brigades, week, assignments };
    expect(dayObjects(base, "b1", "2026-10-27").map((o) => o.id)).toEqual(["o1"]);
    expect(dayObjects({ ...base, schedule }, "b1", "2026-10-27").map((o) => o.id)).toEqual(["o2"]);
    const away = [{ brigadeId: "b1", weekFrom: "2026-10-26", status: "vacation" as const }];
    expect(
      dayObjects({ ...base, schedule, brigadeAvailability: away }, "b1", "2026-10-27"),
    ).toEqual([]);
  });
});
