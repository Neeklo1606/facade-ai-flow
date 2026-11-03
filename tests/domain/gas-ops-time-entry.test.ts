import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { resetState } from "@/adapters/gas-ops/state";
import { buildSeed, GAS_TODAY } from "@/data/mock/gas-ops-seed";
import {
  botReply,
  botStep,
  initialBotState,
  summaryOf,
  type BotContext,
  type BotEvent,
  type BotState,
} from "@/domain/gas-ops/bot-dialog";
import { flagsOf } from "@/domain/gas-ops/calc";
import { crewSummary } from "@/domain/gas-ops/crew";
import { checkEntry } from "@/domain/gas-ops/entry-check";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { parseTimeInput } from "@/domain/gas-ops/time-input";
import { endSlots, startSlots } from "@/domain/gas-ops/time-slots";
import { busyIntervals } from "@/domain/gas-ops/view";
import { drainQueue, type QueuedEntry, type SendResult } from "@/lib/gas-ops/field-queue";
import { GasOpsError } from "@/ports/gas-ops";

/**
 * Ввод времени бригадиром без «занято» (ADR-061, 9; раздел 4.1, строки 1-4 и 12 таблицы 2.1):
 * разбор поля «Время работы», занятость как признак, полный дубль как единственный запрет,
 * сетки кнопок, машина диалога бота, ключ отправки и очередь телефона.
 */

const at = (h: number, m = 0) => h * 60 + m;

describe("разбор поля «Время работы»", () => {
  const cases: [string, string][] = [
    // Одно время
    ["8", "clock 08:00"],
    ["08", "clock 08:00"],
    ["8.20", "clock 08:20"],
    ["8:20", "clock 08:20"],
    ["8 20", "clock 08:20"],
    ["820", "clock 08:20"],
    ["0820", "clock 08:20"],
    ["16.4", "clock 16:40"],
    ["16:40", "clock 16:40"],
    ["8,5", "clock 08:30 ?"],
    ["23:59", "clock 23:59"],
    // Диапазоны
    ["8-17", "range 08:00-17:00"],
    ["8 - 17", "range 08:00-17:00"],
    ["с 8 до 17", "range 08:00-17:00"],
    ["с 13 до 17", "range 13:00-17:00"],
    ["8:00–17:00", "range 08:00-17:00"],
    ["8:00—17:00", "range 08:00-17:00"],
    ["с 8:30 до 16", "range 08:30-16:00"],
    ["830-1700", "range 08:30-17:00"],
    ["0830-1700", "range 08:30-17:00"],
    ["8.20-16.4", "range 08:20-16:40"],
    ["с восьми до пяти", "range 08:00-17:00"],
    ["с 8 до 5", "range 08:00-17:00 ?"],
    ["7-15:30", "range 07:00-15:30"],
    // Неверное
    ["", "error empty"],
    ["   ", "error empty"],
    ["завтра", "error not-time"],
    ["25:00", "error not-time"],
    ["8:75", "error not-time"],
    ["с 17 до 8", "error overnight"],
    ["22-6", "error overnight"],
  ];

  const show = (text: string) => {
    const r = parseTimeInput(text);
    const hhmm = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (r.kind === "clock") return `clock ${hhmm(r.minutes)}${r.confirm ? " ?" : ""}`;
    if (r.kind === "range") return `range ${hhmm(r.start)}-${hhmm(r.end)}${r.confirm ? " ?" : ""}`;
    return `error ${r.reason}`;
  };

  test("таблица из 30 с лишним примеров", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    for (const [text, expected] of cases) expect([text, show(text)]).toEqual([text, expected]);
  });

  test("«с 13 до 17» больше не превращается в 13:17 (строка 2 таблицы 2.1)", () => {
    expect(parseTimeInput("с 13 до 17")).toEqual({
      kind: "range",
      start: at(13),
      end: at(17),
      confirm: false,
    });
  });
});

const seed = buildSeed();
/** ГЗ-00095: Бригада 1, ОБ-101, сегодня 08:10–11:40 */
const morning = seed.entries.find((e) => e.number === "ГЗ-00095")!;

describe("занятость: подсказка и признак, а не запрет", () => {
  const base = { brigadeId: "brg-1", day: GAS_TODAY };

  test("пересечение на другом объекте — признак", () => {
    const check = checkEntry(seed.entries, {
      ...base,
      objectId: "obj-m200",
      start: at(8),
      end: at(17),
    });
    expect(check.twin).toBeNull();
    expect(check.overlaps.map((o) => [o.entry.number, o.minutes])).toEqual([["ГЗ-00095", 210]]);
    expect(check.repeatVisits).toEqual([]);
  });

  test("тот же объект, другой интервал — повторный выезд, не дубль", () => {
    const check = checkEntry(seed.entries, {
      ...base,
      objectId: morning.objectId,
      start: at(13),
      end: at(15),
    });
    expect(check.twin).toBeNull();
    expect(check.overlaps).toEqual([]);
    expect(check.repeatVisits.map((e) => e.number)).toEqual(["ГЗ-00095"]);
  });

  test("полное совпадение объекта, даты и интервала — дубль", () => {
    const check = checkEntry(seed.entries, {
      ...base,
      objectId: morning.objectId,
      start: morning.startMinutes,
      end: morning.endMinutes,
    });
    expect(check.twin?.number).toBe("ГЗ-00095");
  });

  test("касание встык допустимо", () => {
    const check = checkEntry(seed.entries, {
      ...base,
      objectId: "obj-m200",
      start: morning.endMinutes,
      end: at(15),
    });
    expect(check.overlaps).toEqual([]);
  });

  test("исправляемая запись с собой не сравнивается", () => {
    const check = checkEntry(seed.entries, {
      ...base,
      id: morning.id,
      objectId: morning.objectId,
      start: morning.startMinutes,
      end: morning.endMinutes,
    });
    expect(check.twin).toBeNull();
  });

  test("признак повторного выезда у записи для менеджера", () => {
    const second: TimeEntry = {
      ...morning,
      id: "en-second",
      number: "ГЗ-09999",
      startMinutes: at(13),
      endMinutes: at(15),
      minutes: 120,
    };
    const all = [...seed.entries, second];
    const flags = flagsOf({ entry: second, all, hasEstimate: true, objectDays: 1 });
    expect(flags).toContain("repeat-visit");
    expect(flags).not.toContain("duplicate");
  });
});

describe("кнопки времени", () => {
  const busy = busyIntervals(seed, "brg-1", GAS_TODAY);

  test("начало 06:00–20:00, занятое время подписано, но доступно", () => {
    const slots = startSlots(busy);
    expect(slots[0]!.label).toBe("06:00");
    expect(slots.at(-1)!.label).toBe("20:00");
    expect(slots).toHaveLength(15);
    expect(slots.find((s) => s.label === "09:00")!.busy?.number).toBe("ГЗ-00095");
  });

  test("окончание от начала + 30 мин до 23:00", () => {
    const slots = endSlots(busy, at(12));
    expect(slots[0]!.label).toBe("12:30");
    expect(slots.at(-1)!.label).toBe("23:00");
    expect(endSlots([], at(8, 10))[0]!.label).toBe("08:40");
  });
});

/* ------------------------------------------------------------------ Машина диалога бота */

function context(entries: TimeEntry[] = seed.entries.filter((e) => e.brigadeId === "brg-1")) {
  let n = 0;
  const objects = seed.objects.map((o) => ({ id: o.id, label: o.label, code: o.code }));
  return {
    speakerName: "Бригадир 1",
    brigadeId: "brg-1",
    today: GAS_TODAY,
    yesterday: "2026-10-02",
    dayObjects: objects.filter((o) => o.id === "obj-m200" || o.id === "obj-m1"),
    allowed: objects,
    entries,
    crewSize: 4,
    newKey: () => `key-${++n}`,
  } satisfies BotContext;
}

function run(ctx: BotContext, events: BotEvent[], from?: BotState) {
  let state = from ?? initialBotState(ctx);
  const log: { mine: string | null; effect: unknown }[] = [];
  for (const event of events) {
    const step = botStep(state, event, ctx);
    state = step.state;
    log.push({ mine: step.mine, effect: step.effect });
  }
  return { state, log };
}

const key = (k: string): BotEvent => ({ type: "key", key: k });
const text = (t: string): BotEvent => ({ type: "text", text: t });

describe("машина диалога бота", () => {
  test("кнопками: объект, день, начало, окончание, перерыв, сводка, отправка", () => {
    const ctx = context();
    const { state, log } = run(ctx, [
      key("enter"),
      key("obj:obj-m200"),
      key("day:today"),
      key(`start:${at(12)}`),
      key(`end:${at(14, 30)}`),
      key("break:0"),
    ]);
    expect(state.stage.kind).toBe("summary");
    expect(summaryOf(state, ctx).minutes).toBe(150);
    const sent = botStep(state, key("send"), ctx);
    expect(sent.state.stage.kind).toBe("sending");
    expect(sent.effect).toEqual({
      kind: "create",
      day: GAS_TODAY,
      objectId: "obj-m200",
      start: "12:00",
      end: "14:30",
      breakMinutes: 0,
      headcount: null,
      clientKey: "key-2",
    });
    expect(log.map((l) => l.mine)).toEqual([
      "Внести время",
      ctx.allowed.find((o) => o.id === "obj-m200")!.label,
      `Сегодня, 03.10`,
      "12:00",
      "14:30",
      "Без перерыва",
    ]);
    const done = botStep(sent.state, { type: "sent", number: "ГЗ-00104" }, ctx);
    expect(done.state.stage).toEqual({ kind: "done", number: "ГЗ-00104", edited: false });
  });

  test("быстрая кнопка 08:00–17:00 заменяет начало и окончание", () => {
    const ctx = context();
    const { state } = run(ctx, [
      key("enter"),
      key("obj:obj-m200"),
      key("day:today"),
      key(`range:${at(8)}-${at(17)}`),
    ]);
    expect(state.stage.kind).toBe("break");
    expect([state.draft.start, state.draft.end]).toEqual([at(8), at(17)]);
  });

  test("занятое время не выключает кнопки, сводка называет пересечение", () => {
    const ctx = context();
    const { state } = run(ctx, [key("enter"), key("obj:obj-m200"), key("day:today")]);
    const reply = botReply(state, ctx);
    const starts = reply.groups.flatMap((g) => g.keys).filter((k) => k.id.startsWith("start:"));
    expect(starts.every((k) => !k.disabled)).toBe(true);
    expect(starts.find((k) => k.label === "09:00")!.sub).toBe("внесено ГЗ-00095");
    expect(reply.hint).toContain("08:10–11:40");

    const later = run(ctx, [key(`range:${at(8)}-${at(17)}`), key("break:60")], state).state;
    expect(later.stage.kind).toBe("summary");
    expect(summaryOf(later, ctx).flags.map((f) => f.flag)).toEqual(["overlap"]);
  });

  test("«с 13 до 17» сообщением: переспрос «Понял: 13:00–17:00, 4 ч. Верно?»", () => {
    const ctx = context();
    const { state } = run(ctx, [
      key("enter"),
      key("obj:obj-m200"),
      key("day:today"),
      text("с 13 до 17"),
    ]);
    expect(state.stage).toEqual({ kind: "check-time", start: at(13), end: at(17) });
    expect(botReply(state, ctx).text).toBe("Понял: 13:00–17:00, 4 ч. Верно?");
    const yes = run(ctx, [key("yes")], state).state;
    expect(yes.stage.kind).toBe("break");
    expect([yes.draft.start, yes.draft.end]).toEqual([at(13), at(17)]);
  });

  test("«8,5» переспрашивается, а не угадывается молча", () => {
    const ctx = context();
    const { state } = run(ctx, [key("enter"), key("obj:obj-m200"), key("day:today"), text("8,5")]);
    expect(state.stage).toEqual({ kind: "check-time", start: at(8, 30), end: null });
    expect(run(ctx, [key("yes")], state).state.stage.kind).toBe("end");
  });

  test("окончание раньше начала: «Работа через полночь?»", () => {
    const ctx = context();
    const { state } = run(ctx, [
      key("enter"),
      key("obj:obj-m200"),
      key("day:today"),
      text("с 22 до 6"),
    ]);
    expect(state.stage.kind).toBe("time");
    expect(botReply(state, ctx).text).toContain("Работа через полночь?");
  });

  test("свободная фраза на первом шаге ведёт сразу к сводке", () => {
    const ctx = context();
    const phrase = "сегодня петровская 200 с 12 до 14:30 без перерыва";
    const { state, log } = run(ctx, [text(phrase)]);
    expect(log[0]!.mine).toBe(phrase);
    expect(state.draft.objectId).toBe("obj-m200");
    expect(state.stage.kind).toBe("summary");
  });

  test("полный дубль останавливает до сводки и предлагает открыть запись", () => {
    const ctx = context();
    const { state } = run(ctx, [
      key("enter"),
      key(`obj:${morning.objectId}`),
      key("day:today"),
      key(`start:${morning.startMinutes}`),
      key(`end:${morning.endMinutes}`),
      key("break:0"),
    ]);
    expect(state.stage).toMatchObject({ kind: "twin", number: "ГЗ-00095", editable: true });
    const open = run(ctx, [key(`edit:${morning.id}`)], state).state;
    expect(open.draft.editId).toBe(morning.id);
    expect(open.stage.kind).toBe("time");
  });

  test("тот же объект с другим интервалом принимается с пометкой «Повторный выезд»", () => {
    const ctx = context();
    const { state } = run(ctx, [
      key("enter"),
      key(`obj:${morning.objectId}`),
      key("day:today"),
      key(`start:${at(13)}`),
      key(`end:${at(15)}`),
      key("break:0"),
    ]);
    expect(state.stage.kind).toBe("summary");
    expect(summaryOf(state, ctx).flags.map((f) => f.flag)).toEqual(["repeat-visit"]);
  });

  test("«Меньше людей» меняет состав в сводке", () => {
    const ctx = context();
    const { state } = run(ctx, [
      key("enter"),
      key("obj:obj-m200"),
      key("day:today"),
      key(`range:${at(8)}-${at(17)}`),
      key("break:60"),
      key("fewer"),
      key("crew:2"),
    ]);
    expect(state.stage.kind).toBe("summary");
    expect(summaryOf(state, ctx).rows.find(([t]) => t === "Состав")![1]).toBe("2 чел.");
  });
});

/* ------------------------------------------------------------------ Порт: запись, канал, ключ */

describe("порт: пересечение принимается, полный дубль нет", () => {
  const port = createGasOpsDemo();

  beforeEach(async () => {
    resetState();
    await port.signIn("u-foreman-1");
  });

  const input = {
    day: GAS_TODAY,
    brigadeId: "brg-1",
    employeeId: null,
    objectId: "obj-m200",
    start: "08:00",
    end: "17:00",
    breakMinutes: 60,
    submit: true,
  };

  test("08:00–17:00 рядом с 08:10–11:40 принята и ушла менеджеру с признаком", async () => {
    const entry = await port.createEntry({ ...input, clientKey: "k-1", channel: "bot" });
    expect(entry.status).toBe("pending");
    expect(entry.channel).toBe("bot");
    const snapshot = await port.snapshot();
    const flags = flagsOf({
      entry,
      all: snapshot.entries,
      hasEstimate: false,
      objectDays: 1,
    });
    expect(flags).toContain("overlap");
  });

  test("повтор с тем же ключом возвращает ту же запись", async () => {
    const first = await port.createEntry({ ...input, clientKey: "k-2", channel: "bot" });
    const count = (await port.snapshot()).entries.length;
    const again = await port.createEntry({ ...input, clientKey: "k-2", channel: "bot" });
    expect(again.id).toBe(first.id);
    expect((await port.snapshot()).entries.length).toBe(count);
  });

  test("та же запись с новым ключом — отказ «уже есть»", async () => {
    await port.createEntry({ ...input, clientKey: "k-3" });
    let code: string | null = null;
    try {
      await port.createEntry({ ...input, clientKey: "k-4" });
    } catch (error) {
      code = error instanceof GasOpsError ? error.code : "unknown";
    }
    expect(code).toBe("duplicate");
  });

  test("второй выезд на тот же объект в тот же день принят", async () => {
    await port.createEntry({ ...input, end: "12:00", clientKey: "k-5" });
    const second = await port.createEntry({ ...input, start: "13:00", clientKey: "k-6" });
    expect(second.status).toBe("pending");
  });
});

/* ------------------------------------------------------------------ Очередь телефона */

describe("очередь отправки бригадира", () => {
  const item = (clientKey: string): QueuedEntry => ({
    clientKey,
    savedAt: "2026-10-03T12:00:00Z",
    input: {
      day: GAS_TODAY,
      brigadeId: "brg-1",
      employeeId: null,
      objectId: "obj-m200",
      start: "08:00",
      end: "17:00",
      breakMinutes: 60,
      submit: true,
      clientKey,
    },
  });

  test("сбой сети оставляет запись и всё после неё, повтор уходит тем же ключом", async () => {
    const sent: string[] = [];
    let online = false;
    const send = async (q: QueuedEntry): Promise<SendResult> => {
      sent.push(q.clientKey);
      return online
        ? { ok: true, number: `ГЗ-${q.clientKey}` }
        : { ok: false, network: true, message: "нет сети" };
    };
    const first = await drainQueue([item("a"), item("b")], send);
    expect(first.queue.map((q) => q.clientKey)).toEqual(["a", "b"]);
    expect(first.accepted).toEqual([]);

    online = true;
    const second = await drainQueue(first.queue, send);
    expect(second.queue).toEqual([]);
    expect(second.accepted.map((a) => a.clientKey)).toEqual(["a", "b"]);
    expect(sent).toEqual(["a", "a", "b"]);
  });

  test("отказ правила снимает запись с очереди с причиной, остальные уходят", async () => {
    const result = await drainQueue([item("a"), item("b")], async (q) =>
      q.clientKey === "a"
        ? { ok: false, network: false, message: "Такая запись уже есть" }
        : { ok: true, number: "ГЗ-00105" },
    );
    expect(result.queue).toEqual([]);
    expect(result.refused).toEqual([{ clientKey: "a", message: "Такая запись уже есть" }]);
    expect(result.accepted).toEqual([{ clientKey: "b", number: "ГЗ-00105", auto: false }]);
  });

  test("автоприём доходит до экрана бригадира и через очередь", async () => {
    const result = await drainQueue([item("a")], async () => ({
      ok: true,
      number: "ГЗ-00106",
      auto: true,
    }));
    expect(result.accepted).toEqual([{ clientKey: "a", number: "ГЗ-00106", auto: true }]);
  });
});

describe("состав: «Отметить людей» с одним временем", () => {
  test("строки людей с одинаковым временем — «по N ч на человека», а не «разное время»", () => {
    const row = (employeeId: string) => ({
      employeeId,
      startMinutes: at(8),
      endMinutes: at(17),
      breakMinutes: 60,
      minutes: 480,
    });
    const summary = crewSummary({ minutes: 480, headcount: null, people: [row("a"), row("b")] });
    // Между числом и единицей неразрывный пробел: сравниваем текст, а не вид пробела
    expect(summary.replace(/\s/g, " ")).toBe("2 чел., по 8 ч на человека, всего 16 чел.-ч");
  });
});
