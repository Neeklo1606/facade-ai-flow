import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { getSnapshot, resetState, update } from "@/adapters/gas-ops/state";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import {
  acceptBlocker,
  badInterval,
  costBreakdown,
  costLine,
  entryInfo,
  infoCounts,
  isClean,
  manHours,
  manHoursText,
  remarksOf,
} from "@/domain/gas-ops/entry-info";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { entryView, queue, type GasData } from "@/domain/gas-ops/view";
import { GasOpsError } from "@/ports/gas-ops";

/**
 * Четыре типа сведений о записи, «неизвестное не ноль» и расшифровка суммы
 * (ADR-061, 10; раздел 2.3 документа табеля).
 */

const seed = (): GasData => ({ ...buildSeed(), actorId: "u-manager" });

const byNumber = (data: GasData, number: string) => {
  const entry = data.entries.find((e) => e.number === number);
  if (!entry) throw new Error(`нет записи ${number}`);
  return entryView(data, entry);
};

const keys = (data: GasData, number: string) => {
  const info = entryInfo(byNumber(data, number));
  return {
    errors: info.errors.map((r) => r.key),
    suspicions: info.suspicions.map((r) => r.key),
    finance: info.finance.map((r) => r.key),
  };
};

describe("четыре типа сведений", () => {
  test("состояние, ошибки, подозрения и финансы — разные поля", () => {
    const data = seed();
    const info = entryInfo(byNumber(data, "ГЗ-00097"));
    expect(info.state).toBe("pending");
    expect(info.errors).toEqual([]);
    expect(info.suspicions.map((r) => r.key)).toEqual(["overlap"]);
    expect(info.finance.map((r) => r.key)).toEqual([
      "no-cost",
      "manual-amount",
      "needs-agreement",
      "multi-day-object",
    ]);
    for (const remark of remarksOf(info)) {
      expect(remark.found.length).toBeGreaterThan(0);
      expect(remark.data.length).toBeGreaterThan(0);
      expect(remark.todo.length).toBeGreaterThan(0);
    }
  });

  test("повторный выезд и лишний человек — подозрения, не ошибки", () => {
    const data = seed();
    expect(keys(data, "ГЗ-00100").suspicions).toEqual(["over-crew", "repeat-visit"]);
    expect(keys(data, "ГЗ-00100").errors).toEqual([]);
    const view = byNumber(data, "ГЗ-00100");
    expect(view.repeats.map((r) => r.number)).toContain("ГЗ-00099");
  });

  test("внесено позже дня работы — подозрение", () => {
    expect(keys(seed(), "ГЗ-00103").suspicions).toEqual(["late-entry"]);
  });

  test("счётчики не складываются: у записи может быть и подозрение, и финансы", () => {
    const data = seed();
    const pending = queue(data, "pending");
    const counts = infoCounts(pending);
    expect(counts.state.pending).toBe(pending.length);
    expect(counts.suspicions).toBe(5);
    // «Объект на несколько дней» есть у всех шести, но это не неполнота стоимости
    expect(counts.finance).toBe(2);
    expect(counts.errors).toBe(0);
    // Подозрения и финансы вместе больше числа записей: это разные оси, а не части целого
    expect(counts.suspicions + counts.finance).toBeGreaterThan(pending.length);
    const both = pending.filter((v) => {
      const info = entryInfo(v);
      return info.suspicions.length > 0 && info.finance.some((r) => r.key !== "multi-day-object");
    });
    expect(both.map((v) => v.entry.number).sort()).toEqual(["ГЗ-00097", "ГЗ-00098"]);
    expect(counts.clean).toBe(1);
  });

  test("«без замечаний» не смотрит на финансы", () => {
    const data = seed();
    const info = entryInfo(byNumber(data, "ГЗ-00096"));
    expect(info.finance.map((r) => r.key)).toEqual(["multi-day-object"]);
    expect(isClean(info)).toBe(true);
    expect(isClean(entryInfo(byNumber(data, "ГЗ-00098")))).toBe(false);
  });

  test("нет состава — ошибка у записи бригадира, но не у строки отчёта заказчика", () => {
    const data = seed();
    const own = data.entries.find((e) => e.number === "ГЗ-00096")!;
    const fact = data.entries.find((e) => e.source === "fact-report")!;
    expect(fact.headcount ?? null).toBeNull();
    const withoutCrew: GasData = {
      ...data,
      entries: data.entries.map((e) => (e.id === own.id ? { ...e, headcount: null } : e)),
    };
    expect(keys(withoutCrew, "ГЗ-00096").errors).toEqual(["no-crew"]);
    expect(entryInfo(entryView(data, fact)).errors).toEqual([]);
  });

  test("неверный интервал: минуты не сходятся с рамкой", () => {
    const base = { people: null, breakMinutes: 60 } as const;
    const entry = (start: number, end: number, minutes: number) =>
      ({ ...base, startMinutes: start, endMinutes: end, minutes }) as TimeEntry;
    expect(badInterval(entry(480, 1020, 480))).toBe(false);
    expect(badInterval(entry(480, 1020, 300))).toBe(true);
    expect(badInterval(entry(1020, 480, 0))).toBe(true);
    expect(badInterval({ ...entry(0, 0, 90), startMinutes: null, endMinutes: null })).toBe(false);
  });

  test("ноль минут — единственное, что запрещает принять", () => {
    const data = seed();
    const own = data.entries.find((e) => e.number === "ГЗ-00096")!;
    const zero: GasData = {
      ...data,
      entries: data.entries.map((e) =>
        e.id === own.id
          ? { ...e, startMinutes: 480, endMinutes: 540, breakMinutes: 60, minutes: 0 }
          : e,
      ),
    };
    const info = entryInfo(byNumber(zero, "ГЗ-00096"));
    expect(info.errors.map((r) => r.key)).toEqual(["zero-minutes"]);
    expect(acceptBlocker(info)?.key).toBe("zero-minutes");
    expect(acceptBlocker(entryInfo(byNumber(data, "ГЗ-00098")))).toBeNull();
  });
});

describe("порт: принять запись с нулём минут нельзя", () => {
  beforeEach(() => resetState());

  test("подтверждение отказывает, отклонение проходит", async () => {
    const port = createGasOpsDemo();
    const own = getSnapshot().entries.find((e) => e.number === "ГЗ-00096")!;
    // Ставим ноль минут прямо в состояние: через порт такую запись не создать
    update((s) => ({
      ...s,
      entries: s.entries.map((e) => (e.id === own.id ? { ...e, minutes: 0 } : e)),
    }));
    let error: unknown = null;
    try {
      await port.review({ id: own.id, action: "confirm" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(GasOpsError);
    expect((error as GasOpsError).code).toBe("bad-time");
    const rejected = await port.review({ id: own.id, action: "reject", comment: "Ноль минут" });
    expect(rejected.status).toBe("rejected");
  });
});

describe("неизвестное не ноль", () => {
  const entry = (minutes: number, headcount: number | null) => ({
    minutes,
    headcount,
    people: null,
  });

  test("ни у одной записи нет состава — «не рассчитано» с причиной", () => {
    const value = manHours([entry(120, null), entry(60, null), entry(30, null)]);
    expect(value).toEqual({ minutes: 0, total: 3, missing: 3 });
    expect(manHoursText(value)).toEqual({ value: null, reason: "в 3 записях нет состава" });
  });

  test("часть без состава — значение по известным и причина про остальные", () => {
    const value = manHours([entry(120, 2), entry(60, null)]);
    expect(manHoursText(value)).toEqual({
      value: "4\u00a0чел.-ч",
      reason: "в 1 записи нет состава",
    });
  });

  test("у всех состав — без причины", () => {
    expect(manHoursText(manHours([entry(480, 4)]))).toEqual({
      value: "32\u00a0чел.-ч",
      reason: null,
    });
  });

  test("записей нет — тоже не ноль", () => {
    expect(manHoursText(manHours([]))).toEqual({ value: null, reason: "записей нет" });
  });
});

describe("сумма с расшифровкой", () => {
  test("пример из документа: 19 950 ₽ за 2 ч 30 мин", () => {
    const view = byNumber(seed(), "ГЗ-00100");
    const cost = costBreakdown(view, "О. Смирнова");
    expect(cost.amountRub).toBe(19950);
    expect(cost.perHour).toBe(7980);
    expect(costLine(cost).replace(/\s/g, " ")).toBe(
      "19 950 ₽ · смета объекта, версия 2, подтвердил О. Смирнова · длительность 2 ч 30 мин · 7 980 ₽ на час длительности",
    );
  });

  test("ждёт проверки при подтверждённой стоимости: ожидаемая доля по минутам", () => {
    const data = seed();
    const own = data.entries.find((e) => e.number === "ГЗ-00096")!;
    const open: GasData = {
      ...data,
      entries: data.entries.map((e) => (e.id === own.id ? { ...e, amountRub: null } : e)),
    };
    const view = byNumber(open, "ГЗ-00096");
    const cost = costBreakdown(view);
    expect(cost.expected).toBe(true);
    expect(cost.amountRub).toBe(
      Math.round((view.estimate!.amountRub * view.entry.minutes) / view.objectMinutes),
    );
    expect(cost.formula).toContain("начислится при принятии");
    expect(costLine(cost).startsWith("≈ ")).toBe(true);
  });

  test("нет стоимости объекта — «не рассчитано», а не 0 ₽", () => {
    const cost = costBreakdown(byNumber(seed(), "ГЗ-00098"));
    expect(cost.amountRub).toBeNull();
    expect(costLine(cost)).toBe("Не рассчитано · нет подтверждённой стоимости объекта");
  });

  test("строка отчёта заказчика: источник с номером строки", () => {
    const data = seed();
    const fact = data.entries.find((e) => e.source === "fact-report" && e.amountRub !== null)!;
    const cost = costBreakdown(entryView(data, fact));
    expect(cost.source).toContain("недельный отчёт заказчика");
    expect(cost.formula).toBe("Сумма взята из отчёта заказчика как есть.");
  });
});
