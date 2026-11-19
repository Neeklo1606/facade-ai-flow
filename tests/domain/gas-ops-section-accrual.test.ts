import { describe, expect, it } from "bun:test";
import type { TimeEntry } from "@/domain/gas-ops/model";
import {
  FULL_BP,
  accruedRub,
  overlapsAssignment,
  parsePercent,
  personMinutes,
  planAccrual,
  sectionForEntry,
  sectionLedger,
  splitPressure,
  stepRub,
  suggestBp,
  targetRub,
  type SectionAssignment,
  type SectionProgress,
} from "@/domain/gas-ops/section-accrual";

const section = {
  workKopecks: 712_564,
  pressureKopecks: 47_789,
  laborHours: 40,
  removed: false,
};

let n = 0;
function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  n++;
  return {
    id: `e${n}`,
    number: `ГЗ-${n}`,
    day: "2026-09-28",
    brigadeId: "b2",
    employeeId: null,
    objectId: "o1",
    startMinutes: 480,
    endMinutes: 1020,
    breakMinutes: 60,
    minutes: 480,
    amountRub: null,
    status: "pending",
    createdBy: "u",
    createdAt: "2026-09-28T18:00:00",
    reviewedBy: null,
    reviewedAt: null,
    comment: null,
    source: "mock",
    sectionKey: "3",
    ...over,
  };
}

/** Подтвердить пакет по плану: то, что делает адаптер */
function apply(
  entries: TimeEntry[],
  progress: SectionProgress[],
  batch: TimeEntry[],
  decision: Parameters<typeof planAccrual>[0]["decision"],
) {
  const plan = planAccrual({
    section,
    entries,
    progress,
    objectId: "o1",
    sectionKey: "3",
    batch,
    decision,
  });
  if (!plan.ok) return { entries, progress, plan };
  const ids = new Set(batch.map((e) => e.id));
  const next = entries.map((e) => {
    if (!ids.has(e.id)) return e;
    const part = plan.perEntry.get(e.id)!;
    return {
      ...e,
      status: "confirmed" as const,
      amountRub: part.smrRub + part.pressureRub,
      accrual: {
        sectionKey: "3",
        mode: plan.kind === "manual" ? ("manual" as const) : ("share" as const),
        fromBp: plan.fromBp,
        toBp: plan.toBp,
        suggestedBp: plan.suggestedBp,
        ...part,
        reason: plan.reason,
      },
    };
  });
  return {
    entries: next,
    progress: [
      ...progress,
      {
        id: `p${progress.length}`,
        objectId: "o1",
        sectionKey: "3",
        fromBp: plan.fromBp,
        toBp: plan.toBp,
        kind: plan.kind,
        entryIds: [...ids],
        accruedRub: plan.totalRub,
        reason: plan.reason,
        by: "oksana",
        at: "2026-09-28T19:00:00",
      },
    ],
    plan,
  };
}

const WORK_RUB = Math.round(section.workKopecks / 100);

describe("доля выполнения раздела (ADR-078)", () => {
  it("предложение: чел.-ч / норматив, не выше 90 % до завершения", () => {
    expect(suggestBp({ normHours: 40, personMinutes: 18 * 60, currentBp: 0, done: false }).bp).toBe(
      4500,
    );
    const over = suggestBp({ normHours: 40, personMinutes: 50 * 60, currentBp: 0, done: false });
    expect(over.bp).toBe(9000);
    expect(over.capped).toBe(true);
    expect(suggestBp({ normHours: 40, personMinutes: 0, currentBp: 2000, done: false }).bp).toBe(
      2000,
    );
  });

  it("нет норматива — предложения нет; бригадир «закончены» — 100 %", () => {
    expect(suggestBp({ normHours: null, personMinutes: 600, currentBp: 0, done: false }).bp).toBe(
      null,
    );
    expect(suggestBp({ normHours: null, personMinutes: 600, currentBp: 0, done: true }).bp).toBe(
      FULL_BP,
    );
  });

  it("чел.-ч: строки людей, иначе состав × минуты, иначе минуты", () => {
    expect(personMinutes({ minutes: 480, headcount: 3, people: null })).toBe(1440);
    expect(
      personMinutes({
        minutes: 480,
        headcount: 3,
        people: [
          { employeeId: "a", startMinutes: 0, endMinutes: 0, breakMinutes: 0, minutes: 300 },
          { employeeId: "b", startMinutes: 0, endMinutes: 0, breakMinutes: 0, minutes: 200 },
        ],
      }),
    ).toBe(500);
    expect(personMinutes({ minutes: 480 })).toBe(480);
  });

  it("цель при 100 % — ровно стоимость; шаг не отрицательный и не больше остатка", () => {
    expect(targetRub(7126, FULL_BP)).toBe(7126);
    expect(targetRub(7126, 4500)).toBe(3206);
    expect(stepRub({ workRub: 7126, accruedRub: 5000, toBp: 2000 })).toBe(0);
    expect(stepRub({ workRub: 7126, accruedRub: 7000, toBp: FULL_BP })).toBe(126);
  });

  it("опрессовка внутри раздела — по доле сметы; раздел испытаний — целиком", () => {
    const split = splitPressure(1000, section);
    expect(split.smrRub + split.pressureRub).toBe(1000);
    expect(split.pressureRub).toBe(67);
    expect(splitPressure(1000, { workKopecks: 5000, pressureKopecks: 5000 })).toEqual({
      smrRub: 0,
      pressureRub: 1000,
    });
    expect(splitPressure(1000, { workKopecks: 5000, pressureKopecks: null })).toEqual({
      smrRub: 1000,
      pressureRub: 0,
    });
  });

  it("доля вручную: 0–100, иначе отказ", () => {
    expect(parsePercent("45,5")).toBe(4550);
    expect(parsePercent(101)).toBe(null);
    expect(parsePercent("abc")).toBe(null);
  });
});

describe("начисление по разделу: сценарии брифа", () => {
  it("три недели подряд: сумма не больше стоимости, остаток виден; «завершён» — ровно стоимость", () => {
    let entries: TimeEntry[] = [];
    let progress: SectionProgress[] = [];
    for (const day of ["2026-09-28", "2026-10-05", "2026-10-12"]) {
      const batch = [entry({ day, headcount: 2 }), entry({ day, headcount: 2 })];
      entries = [...entries, ...batch];
      ({ entries, progress } = apply(entries, progress, batch, { kind: "share" }));
      expect(accruedRub(entries, "o1", "3")).toBeLessThanOrEqual(WORK_RUB);
    }
    // 3 недели × 2 записи × 2 чел × 8 ч = 96 чел.-ч > 40: предложение упёрлось в 90 %
    expect(progress.at(-1)!.toBp).toBe(9000);
    const ledger = sectionLedger({
      objectId: "o1",
      sections: [
        {
          id: "o1:3",
          objectId: "o1",
          versionId: "v",
          key: "3",
          number: "3",
          title: "Монтаж",
          totalKopecks: 875_660,
          materialsKopecks: 163_096,
          ...section,
        },
      ],
      entries,
      progress,
      assignments: [],
    });
    expect(ledger[0]!.remainingRub).toBe(WORK_RUB - targetRub(WORK_RUB, 9000));

    const last = entry({ day: "2026-10-19" });
    entries = [...entries, last];
    ({ entries, progress } = apply(entries, progress, [last], { kind: "share", done: true }));
    expect(accruedRub(entries, "o1", "3")).toBe(WORK_RUB);
    expect(progress.at(-1)!.kind).toBe("completed");
  });

  it("Оксана меняет долю: начисление пересчитывается от прежней доли", () => {
    const e = entry();
    const plan = planAccrual({
      section,
      entries: [e],
      progress: [],
      objectId: "o1",
      sectionKey: "3",
      batch: [e],
      decision: { kind: "share", percent: "35" },
    });
    expect(plan.ok && plan.kind).toBe("edited");
    expect(plan.ok && plan.totalRub).toBe(targetRub(WORK_RUB, 3500));
    expect(plan.ok && plan.suggestedBp).toBe(2000); // 8 ч из 40 = 20 %
  });

  it("ручное начисление: причина обязательна, не больше остатка", () => {
    const e = entry();
    const base = {
      section: { ...section, laborHours: null },
      entries: [e],
      progress: [],
      objectId: "o1",
      sectionKey: "3",
      batch: [e],
    };
    expect(planAccrual({ ...base, decision: { kind: "share" } }).ok).toBe(false);
    expect(
      planAccrual({ ...base, decision: { kind: "manual", amountRub: 100, reason: " " } }).ok,
    ).toBe(false);
    expect(
      planAccrual({ ...base, decision: { kind: "manual", amountRub: WORK_RUB + 1, reason: "акт" } })
        .ok,
    ).toBe(false);
    const ok = planAccrual({
      ...base,
      decision: { kind: "manual", amountRub: 1000, reason: "акт" },
    });
    expect(ok.ok && ok.totalRub).toBe(1000);
  });

  it("пакет: шаг делится по минутам, сумма частей равна шагу", () => {
    const a = entry({ minutes: 300 });
    const b = entry({ minutes: 600 });
    const plan = planAccrual({
      section,
      entries: [a, b],
      progress: [],
      objectId: "o1",
      sectionKey: "3",
      batch: [a, b],
      decision: { kind: "share" },
    });
    if (!plan.ok) throw new Error(plan.reason);
    const parts = [...plan.perEntry.values()].map((p) => p.smrRub + p.pressureRub);
    expect(parts.reduce((x, y) => x + y, 0)).toBe(plan.totalRub);
    expect(parts[1]!).toBeGreaterThan(parts[0]!);
  });
});

describe("инвариант: случайные последовательности записей и долей", () => {
  // Детерминированный генератор: падение воспроизводится
  function rng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
      return s / 2_147_483_648;
    };
  }

  it("1000 последовательностей: начислено ≤ стоимости, ≥ 0, при 100 % ровно стоимость", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const r = rng(seed);
      let entries: TimeEntry[] = [];
      let progress: SectionProgress[] = [];
      const steps = 1 + Math.floor(r() * 12);
      let completed = false;
      for (let i = 0; i < steps; i++) {
        const batch = Array.from({ length: 1 + Math.floor(r() * 3) }, () =>
          entry({ minutes: 30 + Math.floor(r() * 600), headcount: 1 + Math.floor(r() * 4) }),
        );
        entries = [...entries, ...batch];
        const roll = r();
        const decision =
          roll < 0.4
            ? ({ kind: "share" } as const)
            : roll < 0.75
              ? ({ kind: "share", percent: Math.floor(r() * 10_100) / 100 } as const)
              : roll < 0.9
                ? ({ kind: "manual", amountRub: Math.floor(r() * 3000), reason: "акт" } as const)
                : ({ kind: "share", done: true } as const);
        const out = apply(entries, progress, batch, decision);
        entries = out.entries;
        progress = out.progress;
        if (out.plan.ok && out.plan.toBp === FULL_BP && out.plan.kind !== "manual")
          completed = true;
        const total = accruedRub(entries, "o1", "3");
        expect(total).toBeGreaterThanOrEqual(0);
        expect(total).toBeLessThanOrEqual(WORK_RUB);
        for (const e of entries)
          if (e.accrual) {
            expect(e.accrual.smrRub).toBeGreaterThanOrEqual(0);
            expect(e.accrual.pressureRub).toBeGreaterThanOrEqual(0);
          }
        if (completed) expect(total).toBe(WORK_RUB);
      }
    }
  });
});

describe("назначения разделов бригадам", () => {
  const a = (over: Partial<SectionAssignment>): SectionAssignment => ({
    id: "a",
    objectId: "o1",
    sectionKey: "3",
    title: "Раздел 3",
    brigadeId: "b2",
    from: "2026-09-28",
    to: "2026-10-04",
    by: "oksana",
    at: "2026-09-27T10:00:00",
    ...over,
  });
  const list = [a({}), a({ id: "b", sectionKey: "5", brigadeId: "b4" })];

  it("каждая бригада видит только свой раздел, один раздел подставляется сам", () => {
    expect(sectionForEntry(list, { brigadeId: "b2", day: "2026-09-29", objectId: "o1" })).toEqual({
      ok: true,
      sectionKey: "3",
    });
    expect(sectionForEntry(list, { brigadeId: "b4", day: "2026-09-29", objectId: "o1" })).toEqual({
      ok: true,
      sectionKey: "5",
    });
    expect(
      sectionForEntry(list, { brigadeId: "b2", day: "2026-09-29", objectId: "o1", sectionKey: "5" })
        .ok,
    ).toBe(false);
  });

  it("два раздела на объекте — нужен выбор; вне периода назначений нет", () => {
    const two = [...list, a({ id: "c", sectionKey: "7" })];
    const out = sectionForEntry(two, { brigadeId: "b2", day: "2026-09-29", objectId: "o1" });
    expect(out.ok).toBe(false);
    expect(!out.ok && out.choices).toEqual(["3", "7"]);
    expect(sectionForEntry(list, { brigadeId: "b2", day: "2026-10-10", objectId: "o1" })).toEqual({
      ok: true,
      sectionKey: null,
    });
  });

  it("повтор назначения того же раздела той же бригаде на пересекающийся период", () => {
    expect(overlapsAssignment(list, { ...a({}), from: "2026-10-01", to: null })?.id).toBe("a");
    expect(overlapsAssignment(list, { ...a({}), from: "2026-10-05", to: null })).toBe(null);
  });
});

/*
 * Правила демо-макета распределения (ADR-075), перенесённые на модель доли (ADR-078):
 * макет удалён, его проверки остаются здесь на настоящем расчёте
 */
describe("бывший демо-макет распределения на модели доли", () => {
  const big = { workKopecks: 12_000_000, pressureKopecks: null, laborHours: null, removed: false };
  const base = { entries: [] as TimeEntry[], objectId: "o1", sectionKey: "3" };

  it("40 % + 35 % оставляют 25 % стоимости работ раздела", () => {
    let entries: TimeEntry[] = [];
    let progress: SectionProgress[] = [];
    for (const [i, percent] of [40, 75].entries()) {
      const e = entry({ id: `m${i}` });
      entries = [...entries, e];
      const plan = planAccrual({
        ...base,
        section: big,
        entries,
        progress,
        batch: [e],
        decision: { kind: "share", percent },
      });
      if (!plan.ok) throw new Error(plan.reason);
      entries = entries.map((x) =>
        x.id === e.id
          ? {
              ...x,
              status: "confirmed" as const,
              accrual: {
                sectionKey: "3",
                mode: "share" as const,
                fromBp: plan.fromBp,
                toBp: plan.toBp,
                suggestedBp: null,
                ...plan.perEntry.get(e.id)!,
                reason: null,
              },
            }
          : x,
      );
      progress = [
        ...progress,
        {
          id: `p${i}`,
          objectId: "o1",
          sectionKey: "3",
          fromBp: plan.fromBp,
          toBp: plan.toBp,
          kind: plan.kind,
          entryIds: [e.id],
          accruedRub: plan.totalRub,
          reason: null,
          by: "o",
          at: "t",
        },
      ];
    }
    expect(accruedRub(entries, "o1", "3")).toBe(90_000);
    expect(120_000 - accruedRub(entries, "o1", "3")).toBe(30_000);
  });

  it("рубли не теряются и не начисляются сверх стоимости: два шага по 50 %", () => {
    const tiny = { ...big, workKopecks: 500 };
    const a = entry({ id: "t1" });
    const first = planAccrual({
      ...base,
      section: tiny,
      entries: [a],
      progress: [],
      batch: [a],
      decision: { kind: "share", percent: 50 },
    });
    expect(first.ok && first.totalRub).toBe(2);
    const done = planAccrual({
      ...base,
      section: tiny,
      entries: [a],
      progress: [],
      batch: [a],
      decision: { kind: "share", done: true },
    });
    expect(done.ok && done.totalRub).toBe(5);
  });

  it("100,001 % не округляется до 100 %: отказ", () => {
    const a = entry({ id: "t2" });
    expect(
      planAccrual({
        ...base,
        section: big,
        entries: [a],
        progress: [],
        batch: [a],
        decision: { kind: "share", percent: 100.001 },
      }).ok,
    ).toBe(false);
  });
});
