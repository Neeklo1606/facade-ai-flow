import { describe, expect, test } from "bun:test";
import {
  AGREEMENT_MIN_SAMPLE,
  AUTOPILOT_RULE,
  AUTOPILOT_RULES_VERSION,
  autoReasons,
  autopilotAgreement,
  autopilotAvailability,
  decideEntry,
  decisionLine,
  sampleBucket,
  type AutoDecision,
  type DecideInput,
} from "@/domain/gas-ops/autopilot";
import type { EntryInfo, Remark, RemarkKey } from "@/domain/gas-ops/entry-info";
import type { Review } from "@/domain/gas-ops/model";
import { AUTO_ACTOR, finalCheckList } from "@/domain/gas-ops/review-policy";
import { weekDigestAt } from "@/domain/gas-ops/reminders";
import type { TimeEntry } from "@/domain/gas-ops/model";

/** Автопилот проверки (ADR-070): каждое правило отдельно, выборка, счётчик, сводка недели */

const remark = (key: RemarkKey, kind: Remark["kind"] = "suspicion"): Remark => ({
  key,
  kind,
  label: key,
  found: "",
  data: "",
  todo: "",
  blocksAccept: false,
});

const info = (...remarks: Remark[]): EntryInfo => ({
  state: "pending",
  errors: remarks.filter((r) => r.kind === "error"),
  suspicions: remarks.filter((r) => r.kind === "suspicion"),
  finance: remarks.filter((r) => r.kind === "finance"),
});

const clean: DecideInput = {
  mode: "none",
  entry: { id: "en-1", status: "pending", minutes: 480, objectId: "ob-1" },
  info: info(),
  hasConfirmedEstimate: true,
  expectedObjectIds: ["ob-1"],
  at: "2026-10-01T17:10",
};

const keys = (input: DecideInput) => autoReasons(input).map((r) => r.key);

describe("правила автопилота: каждое замечание отправляет запись в очередь", () => {
  test("чистая запись по графику с подтверждённой сметой принимается сама", () => {
    const d = decideEntry(clean);
    expect(d.route).toBe("auto");
    expect(d.reasons).toEqual([]);
    expect(d.rule).toBe(AUTOPILOT_RULE);
    expect(d.version).toBe(AUTOPILOT_RULES_VERSION);
  });

  for (const key of [
    "overlap",
    "duplicate",
    "repeat-visit",
    "late-entry",
    "over-crew",
    "high-rate",
  ] as const)
    test(`подозрение «${key}» – в очередь`, () => {
      const input = { ...clean, info: info(remark(key)) };
      expect(keys(input)).toContain(key);
      expect(decideEntry(input).route).toBe("queue");
    });

  for (const key of ["zero-minutes", "bad-interval", "no-crew"] as const)
    test(`ошибка данных «${key}» – в очередь`, () => {
      expect(decideEntry({ ...clean, info: info(remark(key, "error")) }).route).toBe("queue");
    });

  test("ручная сумма и согласование стоимости – в очередь: деньги решает человек", () => {
    expect(decideEntry({ ...clean, info: info(remark("manual-amount", "finance")) }).route).toBe(
      "queue",
    );
    expect(decideEntry({ ...clean, info: info(remark("needs-agreement", "finance")) }).route).toBe(
      "queue",
    );
  });

  test("«объект на несколько дней» только сведение: принятию не мешает", () => {
    expect(decideEntry({ ...clean, info: info(remark("multi-day-object", "finance")) }).route).toBe(
      "auto",
    );
  });

  test("нет подтверждённой сметы – в очередь, причина названа", () => {
    const d = decideEntry({ ...clean, hasConfirmedEstimate: false });
    expect(d.route).toBe("queue");
    expect(d.reasons.map((r) => r.label)).toEqual(["Нет подтверждённой сметы"]);
  });

  test("длительность выше порога – в очередь; на пороге – принимается", () => {
    const long = { ...clean, entry: { ...clean.entry, minutes: 12 * 60 + 1 } };
    expect(keys(long)).toEqual(["too-long"]);
    expect(decideEntry({ ...clean, entry: { ...clean.entry, minutes: 12 * 60 } }).route).toBe(
      "auto",
    );
    expect(decideEntry({ ...long, config: { maxMinutes: 13 * 60, samplePercent: 10 } }).route).toBe(
      "auto",
    );
  });

  test("объект не по графику бригады или графика на день нет – в очередь", () => {
    expect(keys({ ...clean, expectedObjectIds: ["ob-2"] })).toEqual(["off-schedule"]);
    expect(keys({ ...clean, expectedObjectIds: null })).toEqual(["no-schedule"]);
  });

  test("неотправленная запись не принимается", () => {
    expect(keys({ ...clean, entry: { ...clean.entry, status: "draft" } })).toEqual([
      "not-submitted",
    ]);
  });
});

describe("режимы", () => {
  test("«Проверять всё»: решение только тень, запись ждёт менеджера", () => {
    const d = decideEntry({ ...clean, mode: "all" });
    expect(d.route).toBe("queue");
    expect(d.reasons).toEqual([]);
    expect(decisionLine(d)).toContain("Автопилот принял бы сам: да");
  });

  test("«Только с замечаниями»: чистая принимается, все авто-принятые идут в итоговую проверку", () => {
    const d = decideEntry({ ...clean, mode: "flagged" });
    expect(d.route).toBe("auto");
    expect(d.sampled).toBe(true);
  });

  test("история называет правило и версию", () => {
    expect(decisionLine(decideEntry(clean))).toBe(
      `Принято автоматически: нет замечаний (правило ${AUTOPILOT_RULE}, версия ${AUTOPILOT_RULES_VERSION})`,
    );
    expect(decisionLine(decideEntry({ ...clean, hasConfirmedEstimate: false }))).toContain(
      "В очередь: нет подтверждённой сметы",
    );
  });
});

describe("выборочная проверка", () => {
  test("выборка стабильна для записи и около заданной доли", () => {
    expect(sampleBucket("en-42")).toBe(sampleBucket("en-42"));
    const ids = Array.from({ length: 2000 }, (_, i) => `en-${i}`);
    const share = ids.filter((id) => sampleBucket(id) < 10).length / ids.length;
    expect(share).toBeGreaterThan(0.07);
    expect(share).toBeLessThan(0.13);
  });

  test("в выборку попадает ровно та запись, чья корзина ниже доли; 100% – все", () => {
    const id = "en-x";
    const bucket = sampleBucket(id);
    const at = (samplePercent: number) =>
      decideEntry({
        ...clean,
        entry: { ...clean.entry, id },
        config: { maxMinutes: 720, samplePercent },
      }).sampled;
    expect(at(bucket + 1)).toBe(true);
    expect(at(bucket)).toBe(false);
    expect(at(100)).toBe(true);
  });

  test("итоговая проверка при автопилоте: только выборка; запись до ADR-070 – вся", () => {
    const base = {
      day: "2026-10-01",
      status: "confirmed",
      reviewedBy: AUTO_ACTOR,
    } as unknown as TimeEntry;
    const decision = (sampled: boolean): AutoDecision => ({
      ...decideEntry(clean),
      sampled,
    });
    const entries = [
      { ...base, id: "a", autoDecision: decision(true) },
      { ...base, id: "b", autoDecision: decision(false) },
      { ...base, id: "c" },
    ];
    expect(finalCheckList(entries, [], ["2026-10-01"]).map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("счётчик совпадения авто-решений с решениями менеджера", () => {
  const review = (entryId: string, action: Review["action"], at = "2026-10-01T12:00"): Review => ({
    id: `r-${entryId}-${action}`,
    entryId,
    action,
    actor: "u-manager",
    at,
    comment: null,
    changes: [],
  });
  const shadow = (auto: boolean): AutoDecision =>
    decideEntry({ ...clean, mode: "all", hasConfirmedEstimate: auto });

  test("совпадения, опасные и осторожные расхождения считаются раздельно", () => {
    const a = autopilotAgreement({
      entries: [
        { id: "1", autoDecision: shadow(true) },
        { id: "2", autoDecision: shadow(true) },
        { id: "3", autoDecision: shadow(false) },
        { id: "4", autoDecision: shadow(false) },
        { id: "5", autoDecision: null },
      ],
      reviews: [
        review("1", "confirm"),
        review("2", "correct"),
        review("2", "confirm"),
        review("3", "reject"),
        review("4", "confirm"),
        review("5", "confirm"),
      ],
      now: "2026-10-02T19:00",
    });
    expect(a).toMatchObject({
      total: 4,
      matched: 2,
      risky: 1,
      cautious: 1,
      recomputed: 0,
      percent: null,
    });
  });

  test("окно 14 дней и автоматические решения не считаются; процент с выборки", () => {
    const entries = Array.from({ length: AGREEMENT_MIN_SAMPLE + 1 }, (_, i) => ({
      id: String(i),
      autoDecision: shadow(true),
    }));
    const reviews = [
      ...entries.slice(0, AGREEMENT_MIN_SAMPLE).map((e) => review(e.id, "confirm")),
      review(String(AGREEMENT_MIN_SAMPLE), "confirm", "2026-09-01T12:00"),
      { ...review("0", "confirm"), id: "auto", actor: AUTO_ACTOR },
    ];
    const a = autopilotAgreement({ entries, reviews, now: "2026-10-02T19:00" });
    expect(a.total).toBe(AGREEMENT_MIN_SAMPLE);
    expect(a.percent).toBe(100);
    expect(a.from).toBe("2026-09-19");
    expect(autopilotAvailability(a).ok).toBe(true);
  });

  test("ниже порога 99,9% включить можно только с оговоркой, причина с числами", () => {
    const a = {
      total: 40,
      matched: 39,
      risky: 1,
      cautious: 0,
      recomputed: 0,
      percent: 97.5,
      from: "2026-09-19",
      to: "2026-10-02",
    };
    const result = autopilotAvailability(a);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.overridable).toBe(true);
      expect(result.reason).toContain("97,5%");
      expect(result.reason).toContain("опасных расхождений 1");
    }
  });
});

describe("пятница 16:00: неделя руководителю", () => {
  const base = {
    weekFrom: "2026-09-28",
    closed: false,
    blocking: [],
    confirmed: 12,
    users: [
      { id: "d", role: "director" as const },
      { id: "m", role: "manager" as const },
    ],
  };

  test("до пятницы 16:00 ничего, с 16:00 руководителю «готова к закрытию»", () => {
    expect(weekDigestAt({ ...base, at: "2026-10-02T15:59" })).toEqual([]);
    const [msg, ...rest] = weekDigestAt({ ...base, at: "2026-10-02T16:00" });
    expect(rest).toEqual([]);
    expect(msg?.userId).toBe("d");
    expect(msg?.text).toContain("готова к закрытию");
    expect(msg?.links[0]?.to).toBe("/gas/week");
  });

  test("есть что мешает – список причин; закрытая неделя – тишина", () => {
    const [msg] = weekDigestAt({
      ...base,
      at: "2026-10-02T16:30",
      blocking: [{ text: "Не проверено записей: 2" }],
    });
    expect(msg?.text).toContain("Что мешает: Не проверено записей: 2");
    expect(weekDigestAt({ ...base, closed: true, at: "2026-10-03T09:00" })).toEqual([]);
  });
});

describe("решение над данными направления", () => {
  test("демо-история даёт счётчику пересчитанные решения, отправленная запись – сохранённое", async () => {
    const { resetState } = await import("@/adapters/gas-ops/state");
    const { createGasOpsDemo } = await import("@/adapters/gas-ops/demo");
    const { retroDecision } = await import("@/domain/gas-ops/autopilot-data");
    resetState();
    const port = createGasOpsDemo();
    await port.signIn("u-manager");
    const s = await port.snapshot();
    const reviewed = new Set(s.reviews.filter((r) => r.actor !== AUTO_ACTOR).map((r) => r.entryId));
    const history = s.entries.filter((e) => reviewed.has(e.id));
    expect(history.length).toBeGreaterThan(0);
    for (const e of history) {
      const d = retroDecision(s, e);
      if (d) expect(d.mode).toBe("all");
    }
    const a = autopilotAgreement({
      entries: s.entries.map((e) => ({
        id: e.id,
        autoDecision: retroDecision(s, e),
        retro: !e.autoDecision,
      })),
      reviews: s.reviews,
      now: `${s.today}T23:59`,
    });
    expect(a.recomputed).toBe(a.total);
  });
});
