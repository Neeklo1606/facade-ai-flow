/**
 * Диалог бота бригадира как машина состояний (ADR-061, 9; разделы 4.2 и 6). Без React:
 * состояние и событие (кнопка, текст, ответ сервера) дают следующее состояние, реплику
 * человека для ленты и действие для порта. Ту же машину возьмёт серверный обработчик MAX,
 * веб-симулятор в демо (`BotChat`) только рисует её ответы.
 *
 * Путь кнопками: «Внести время» → объект → день → начало → окончание → перерыв → «Отправить».
 * Быстрые кнопки «08:00–17:00» сокращают его на одно касание. Свободный текст на любом шаге
 * разбирается целиком: время — `parseTimeInput` с переспросом, фраза с адресом —
 * `parseTimeMessage` со ссылкой на кусок фразы. Занятость — подсказка, а не запрет.
 */
import { formatClock } from "./calc";
import { checkEntry, checkFlags, entryFrame } from "./entry-check";
import type { EntryFlag, TimeEntry } from "./model";
import { FLAG_LABEL } from "./model";
import { parseTimeMessage, type ParsedTime } from "./parse-time-message";
import { parseTimeInput, spanLabel, TIME_INPUT_TEXT } from "./time-input";
import { busyLine, endSlots, intervalLabel, startSlots } from "./time-slots";
import { busyIntervals, type BusyInterval } from "./view";

export const BOT_BREAKS = [0, 30, 45, 60, 90] as const;
export const BOT_RANGES = [
  [8 * 60, 17 * 60],
  [8 * 60, 16 * 60],
] as const;
const DAY_OBJECTS_MAX = 6;
const CREW_KEYS_MAX = 12;

export interface BotObject {
  id: string;
  label: string;
  code?: string | null;
  settlement?: string | null;
}

export interface BotContext {
  speakerName: string;
  brigadeId: string;
  today: string;
  yesterday: string;
  /** Объекты бригады на сегодня из графика: первые кнопки */
  dayObjects: readonly BotObject[];
  /** Все объекты, по которым бригаде можно вносить время: поиск «Другой адрес» */
  allowed: readonly BotObject[];
  /** Записи бригады: занятость, дубль, «Мои записи» */
  entries: readonly TimeEntry[];
  /** Состав бригады на сегодня; null — не задан */
  crewSize: number | null;
  /** Ключ отправки новой записи: повторная доставка не создаёт вторую запись */
  newKey: () => string;
}

export interface BotDraft {
  objectId: string | null;
  day: string | null;
  start: number | null;
  end: number | null;
  breakMinutes: number | null;
  /** null — вся бригада по составу на дату (правило порта) */
  headcount: number | null;
  editId: string | null;
  editNumber: string | null;
  editStatus: TimeEntry["status"] | null;
  clientKey: string;
}

export type BotStage =
  | { kind: "hello" }
  | { kind: "object" }
  | { kind: "search" }
  | { kind: "found"; query: string; ids: string[] }
  | { kind: "day" }
  | { kind: "time" }
  | { kind: "typed"; field: "range" | "end" }
  | { kind: "end" }
  /** Переспрос набранного: «Понял: 13:00–17:00, 4 ч. Верно?» */
  | { kind: "check-time"; start: number; end: number | null }
  | { kind: "break" }
  | { kind: "crew" }
  | { kind: "summary" }
  | { kind: "twin"; entryId: string; number: string; frame: string; editable: boolean }
  /** Ждём ответа порта; `answer` — номер записи, если отправлен ответ менеджеру */
  | { kind: "sending"; answer?: string }
  | { kind: "failed"; message: string }
  | { kind: "done"; number: string; edited: boolean }
  | { kind: "mine" }
  | { kind: "answer"; entryId: string; number: string }
  | { kind: "answered"; number: string }
  /* Голос (ADR-049): запись, затем разбор фразы тем же правилом */
  | { kind: "voice" }
  | { kind: "parsing"; text: string; demo: boolean };

export interface BotState {
  stage: BotStage;
  draft: BotDraft;
  /** Значения до исправления: на кнопках подпись «было» */
  previous: BotDraft | null;
  /** Ответ не принят: бот переспрашивает тем же шагом с причиной */
  error: string | null;
}

export type BotEvent =
  | { type: "key"; key: string }
  | { type: "text"; text: string }
  | { type: "voice"; text: string; demo: boolean }
  | { type: "parsed" }
  | { type: "sent"; number: string }
  | { type: "failed"; message: string };

export type BotEffect =
  | {
      kind: "create";
      day: string;
      objectId: string;
      start: string;
      end: string;
      breakMinutes: number;
      headcount: number | null;
      clientKey: string;
    }
  | {
      kind: "update";
      id: string;
      start: string;
      end: string;
      breakMinutes: number;
      /** Черновик и запись на уточнении после правки уходят на проверку снова */
      resubmit: boolean;
    }
  | { kind: "answer"; id: string; text: string };

export interface BotStep {
  state: BotState;
  /** Реплика человека в ленту; null — бот идёт дальше сам */
  mine: string | null;
  /** Сообщения бота перед следующим вопросом: что нашлось во фразе */
  notes: string[];
  effect: BotEffect | null;
}

export interface BotKey {
  id: string;
  label: string;
  sub?: string;
  /** Подпись для чтения с экрана, если на кнопке больше, чем текст */
  aria?: string;
  tone?: "primary";
  disabled?: boolean;
  /** Значение до исправления */
  previous?: boolean;
  align?: "start";
  tour?: string;
  /** Что выбирает кнопка: для подсветки рекомендуемого в показе */
  pick?: { kind: "object" | "start" | "end" | "break"; value: string | number };
}

export interface BotReply {
  text: string;
  /** Пояснение мелким шрифтом под текстом */
  hint?: string;
  danger?: boolean;
  /** Группы кнопок сверху вниз */
  groups: { cols?: 2 | 3; keys: BotKey[] }[];
  /** Особый блок вместо текста: сводка или список записей */
  card?: "summary" | "mine";
  /** Поле ввода под лентой; null — шаг его не ждёт */
  composer: { label: string; placeholder: string } | null;
}

/* ------------------------------------------------------------------ Помощники */

export const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

function blankDraft(ctx: BotContext): BotDraft {
  return {
    objectId: null,
    day: null,
    start: null,
    end: null,
    breakMinutes: null,
    headcount: null,
    editId: null,
    editNumber: null,
    editStatus: null,
    clientKey: ctx.newKey(),
  };
}

export function initialBotState(ctx: BotContext): BotState {
  return { stage: { kind: "hello" }, draft: blankDraft(ctx), previous: null, error: null };
}

/** Исправлять в боте можно всё, по чему менеджер ещё не принял решение (как в порте) */
export function editableInBot(entry: TimeEntry): boolean {
  return (
    (entry.status === "draft" || entry.status === "pending" || entry.status === "clarify") &&
    entry.startMinutes !== null &&
    entry.endMinutes !== null
  );
}

function objectOf(ctx: BotContext, id: string | null): BotObject | null {
  return ctx.dayObjects.find((o) => o.id === id) ?? ctx.allowed.find((o) => o.id === id) ?? null;
}

export function busyOf(ctx: BotContext, draft: BotDraft): BusyInterval[] {
  if (!draft.day) return [];
  return busyIntervals(
    { entries: [...ctx.entries] },
    ctx.brigadeId,
    draft.day,
    draft.editId ?? undefined,
  );
}

/** Признаки будущей записи и полный дубль: та же функция, что у формы и порта */
export function draftCheck(ctx: BotContext, draft: BotDraft) {
  if (!draft.objectId || !draft.day) return null;
  return checkEntry(ctx.entries, {
    id: draft.editId,
    brigadeId: ctx.brigadeId,
    objectId: draft.objectId,
    day: draft.day,
    start: draft.start,
    end: draft.end,
  });
}

/** Записи «Моих записей»: последние сверху */
export function recentEntries(ctx: BotContext, max = 5): TimeEntry[] {
  return [...ctx.entries].sort((a, b) => b.number.localeCompare(a.number)).slice(0, max);
}

function clarifyEntries(ctx: BotContext): TimeEntry[] {
  return ctx.entries.filter((e) => e.status === "clarify");
}

/** Следующий недостающий шаг. Полный дубль останавливает до сводки */
function next(ctx: BotContext, draft: BotDraft): BotStage {
  if (!draft.objectId) return { kind: "object" };
  if (!draft.day) return { kind: "day" };
  if (draft.start === null) return { kind: "time" };
  if (draft.end === null) return { kind: "end" };
  if (draft.breakMinutes === null) return { kind: "break" };
  const check = draftCheck(ctx, draft);
  if (check?.twin)
    return {
      kind: "twin",
      entryId: check.twin.id,
      number: check.twin.number,
      frame: entryFrame(check.twin),
      editable: editableInBot(check.twin),
    };
  return { kind: "summary" };
}

function go(
  state: BotState,
  stage: BotStage,
  mine: string | null,
  patch: Partial<BotDraft> = {},
): BotStep {
  return {
    state: { ...state, stage, draft: { ...state.draft, ...patch }, error: null },
    mine,
    notes: [],
    effect: null,
  };
}

function refuse(state: BotState, mine: string, error: string): BotStep {
  return { state: { ...state, error }, mine, notes: [], effect: null };
}

/** Что нашлось во фразе, с источником: каждое значение называет кусок фразы (правило 2) */
export function foundLine(parsed: ParsedTime): string {
  const parts = [
    parsed.quotes.object && `объект «${parsed.quotes.object}»`,
    parsed.quotes.day && `день «${parsed.quotes.day}»`,
    parsed.quotes.start && `начало «${parsed.quotes.start}»`,
    parsed.quotes.end && `окончание «${parsed.quotes.end}»`,
    parsed.quotes.break && `перерыв «${parsed.quotes.break}»`,
  ].filter(Boolean);
  const head = parts.length
    ? `Нашла: ${parts.join(", ")}.`
    : "Не нашла в фразе ни объекта, ни времени.";
  const why = [
    parsed.reasons.object && `Объект не выбран: ${parsed.reasons.object}.`,
    parsed.reasons.end && `Окончание не принято: ${parsed.reasons.end}.`,
  ].filter(Boolean);
  return [head, ...why].join(" ");
}

/** Фраза целиком: «сегодня на Северной 200 с 8 до 17, обед час» */
function applyPhrase(state: BotState, text: string, ctx: BotContext, mine: string | null): BotStep {
  const candidates = [
    ...ctx.dayObjects,
    ...ctx.allowed.filter((o) => !ctx.dayObjects.some((d) => d.id === o.id)),
  ];
  const parsed = parseTimeMessage(
    text,
    candidates.map((o) => ({ id: o.id, label: o.label, ...(o.code ? { code: o.code } : {}) })),
    ctx.today,
  );
  const base = state.stage.kind === "hello" ? blankDraft(ctx) : state.draft;
  const draft: BotDraft = {
    ...base,
    objectId: parsed.objectId ?? base.objectId,
    day: parsed.day ?? base.day ?? (parsed.objectId || parsed.start !== null ? ctx.today : null),
    start: parsed.start ?? base.start,
    end: parsed.start !== null ? parsed.end : base.end,
    breakMinutes: parsed.breakMin ?? base.breakMinutes,
  };
  return {
    state: { ...state, draft, stage: next(ctx, draft), error: null },
    mine,
    notes: [foundLine(parsed)],
    effect: null,
  };
}

/** Набранный текст на шаге, где ждали время или фразу */
function onText(state: BotState, text: string, ctx: BotContext): BotStep {
  const { stage } = state;
  if (stage.kind === "search" || stage.kind === "found") return search(state, text, ctx);
  if (stage.kind === "answer")
    return {
      state: { ...state, stage: { kind: "sending", answer: stage.number }, error: null },
      mine: text,
      notes: [],
      effect: { kind: "answer", id: stage.entryId, text },
    };
  if (stage.kind === "voice") return voice(state, text, false);

  const time = parseTimeInput(text);
  const draft = stage.kind === "hello" ? blankDraft(ctx) : state.draft;
  const wantsEnd =
    (stage.kind === "end" || (stage.kind === "typed" && stage.field === "end")) &&
    draft.start !== null;
  if (time.kind === "range") {
    return go({ ...state, draft }, { kind: "check-time", start: time.start, end: time.end }, text);
  }
  if (time.kind === "clock") {
    if (wantsEnd) {
      if (time.minutes <= draft.start!)
        return refuse(
          state,
          text,
          `Окончание должно быть позже начала ${formatClock(draft.start!)}. Напишите время ещё раз.`,
        );
      return go(
        { ...state, draft },
        { kind: "check-time", start: draft.start!, end: time.minutes },
        text,
      );
    }
    if (time.confirm)
      return go({ ...state, draft }, { kind: "check-time", start: time.minutes, end: null }, text);
    return go({ ...state, draft }, { kind: "end" }, text, { start: time.minutes, end: null });
  }
  if (time.reason === "overnight") return refuse(state, text, TIME_INPUT_TEXT.overnight);
  const phrase = applyPhrase({ ...state, draft }, text, ctx, text);
  const changed =
    phrase.state.draft.objectId !== draft.objectId ||
    phrase.state.draft.day !== draft.day ||
    phrase.state.draft.start !== draft.start ||
    phrase.state.draft.breakMinutes !== draft.breakMinutes;
  if (changed) return phrase;
  return refuse(
    state,
    text,
    "Не поняла. Напишите время, например «с 8 до 17», или всё сразу: «Северная 200, с 8 до 17, обед час».",
  );
}

function search(state: BotState, query: string, ctx: BotContext): BotStep {
  const words = query.toLowerCase().replace(/ё/g, "е").split(/\s+/).filter(Boolean);
  const ids = ctx.allowed
    .filter((o) => {
      const hay = `${o.label} ${o.code ?? ""} ${o.settlement ?? ""}`
        .toLowerCase()
        .replace(/ё/g, "е");
      return words.every((w) => hay.includes(w));
    })
    .slice(0, DAY_OBJECTS_MAX)
    .map((o) => o.id);
  return go(state, { kind: "found", query, ids }, query);
}

function voice(state: BotState, text: string, demo: boolean): BotStep {
  return go(state, { kind: "parsing", text, demo }, demo ? `«${text}»` : text);
}

function editStep(state: BotState, entry: TimeEntry, mine: string): BotStep {
  const draft: BotDraft = {
    ...state.draft,
    objectId: entry.objectId,
    day: entry.day,
    start: entry.startMinutes,
    end: entry.endMinutes,
    breakMinutes: entry.breakMinutes,
    headcount: entry.headcount ?? null,
    editId: entry.id,
    editNumber: entry.number,
    editStatus: entry.status,
  };
  return {
    state: { stage: { kind: "time" }, draft, previous: draft, error: null },
    mine,
    notes: [],
    effect: null,
  };
}

function sendStep(state: BotState): BotStep {
  const d = state.draft;
  if (!d.objectId || !d.day || d.start === null || d.end === null || d.breakMinutes === null)
    return go(state, { kind: "time" }, "Отправить");
  const effect: BotEffect = d.editId
    ? {
        kind: "update",
        id: d.editId,
        start: formatClock(d.start),
        end: formatClock(d.end),
        breakMinutes: d.breakMinutes,
        resubmit: d.editStatus === "draft" || d.editStatus === "clarify",
      }
    : {
        kind: "create",
        day: d.day,
        objectId: d.objectId,
        start: formatClock(d.start),
        end: formatClock(d.end),
        breakMinutes: d.breakMinutes,
        headcount: d.headcount,
        clientKey: d.clientKey,
      };
  return {
    state: { ...state, stage: { kind: "sending" }, error: null },
    mine: "Отправить",
    notes: [],
    effect,
  };
}

/* ------------------------------------------------------------------ Переходы */

export function botStep(state: BotState, event: BotEvent, ctx: BotContext): BotStep {
  const { stage, draft } = state;

  if (event.type === "text") return onText(state, event.text.trim(), ctx);
  if (event.type === "voice") return voice(state, event.text, event.demo);
  if (event.type === "parsed" && stage.kind === "parsing")
    return applyPhrase({ ...state, draft: blankDraft(ctx) }, stage.text, ctx, null);
  if (event.type === "sent") {
    if (stage.kind !== "sending") return { state, mine: null, notes: [], effect: null };
    return {
      state: {
        ...state,
        stage: stage.answer
          ? { kind: "answered", number: stage.answer }
          : { kind: "done", number: event.number, edited: !!draft.editId },
        error: null,
      },
      mine: null,
      notes: [],
      effect: null,
    };
  }
  if (event.type === "failed")
    return {
      state: { ...state, stage: { kind: "failed", message: event.message }, error: null },
      mine: null,
      notes: [],
      effect: null,
    };
  if (event.type !== "key") return { state, mine: null, notes: [], effect: null };

  const key = event.key;
  const [kind, value = ""] = key.split(":");
  switch (kind) {
    case "enter":
      return {
        state: { stage: { kind: "object" }, draft: blankDraft(ctx), previous: null, error: null },
        mine: value === "again" ? "Внести ещё адрес" : "Внести время",
        notes: [],
        effect: null,
      };
    case "mine":
      return go(state, { kind: "mine" }, "Мои записи");
    case "clarify":
      return go(state, { kind: "mine" }, `Уточнения (${clarifyEntries(ctx).length})`);
    case "answer": {
      const entry = ctx.entries.find((e) => e.id === value);
      if (!entry) return go(state, { kind: "mine" }, "Мои записи");
      return go(
        state,
        { kind: "answer", entryId: entry.id, number: entry.number },
        `Ответить по ${entry.number}`,
      );
    }
    case "voice":
      return go(state, { kind: "voice" }, "Сказать голосом");
    case "search":
      return go(state, { kind: "search" }, "Другой адрес");
    case "objects":
      return go(state, { kind: "object" }, "Объекты на сегодня");
    case "obj": {
      const object = objectOf(ctx, value);
      if (!object) return go(state, { kind: "object" }, "Другой объект");
      const patch = { objectId: object.id };
      return go(state, next(ctx, { ...draft, ...patch }), object.label, patch);
    }
    case "day": {
      const day = value === "yesterday" ? ctx.yesterday : ctx.today;
      const label = value === "yesterday" ? `Вчера, ${shortDay(day)}` : `Сегодня, ${shortDay(day)}`;
      return go(state, next(ctx, { ...draft, day }), label, { day });
    }
    case "range": {
      const [from, to] = value.split("-").map(Number) as [number, number];
      const patch = { start: from, end: to };
      return go(state, next(ctx, { ...draft, ...patch }), intervalLabel(from, to), patch);
    }
    case "start": {
      const start = Number(value);
      return go(state, { kind: "end" }, formatClock(start), { start, end: null });
    }
    case "end": {
      const end = Number(value);
      const patch = { end };
      return go(state, next(ctx, { ...draft, ...patch }), formatClock(end), patch);
    }
    case "typed":
      return go(state, { kind: "typed", field: value === "end" ? "end" : "range" }, "Своё время");
    case "yes": {
      if (stage.kind !== "check-time") return { state, mine: null, notes: [], effect: null };
      const patch = { start: stage.start, end: stage.end };
      return go(
        state,
        stage.end === null ? { kind: "end" } : next(ctx, { ...draft, ...patch }),
        "Верно",
        patch,
      );
    }
    case "retype":
      return go(state, { kind: "typed", field: "range" }, "Исправить");
    case "break": {
      const breakMinutes = Number(value);
      const patch = { breakMinutes };
      return go(
        state,
        next(ctx, { ...draft, ...patch }),
        breakMinutes === 0 ? "Без перерыва" : `${breakMinutes} мин`,
        patch,
      );
    }
    case "fewer":
      return go(state, { kind: "crew" }, "Меньше людей");
    case "crew": {
      const headcount = Number(value);
      return go(state, { kind: "summary" }, `${headcount} чел.`, { headcount });
    }
    case "send":
      return sendStep(state);
    case "change":
      return {
        state: { ...state, stage: { kind: "time" }, previous: draft, error: null },
        mine: "Изменить",
        notes: [],
        effect: null,
      };
    case "edit": {
      const entry = ctx.entries.find((e) => e.id === value);
      if (!entry) return go(state, { kind: "mine" }, "Мои записи");
      return editStep(
        state,
        entry,
        `${stage.kind === "twin" ? "Открыть" : "Изменить"} ${entry.number}`,
      );
    }
    case "retime":
      return go(state, { kind: "time" }, "Изменить время");
    case "other":
      return go(state, { kind: "object" }, "Другой объект", { objectId: null });
    default:
      return { state, mine: null, notes: [], effect: null };
  }
}

/* ------------------------------------------------------------------ Реплики бота */

function crewText(ctx: BotContext, draft: BotDraft): string {
  if (draft.headcount !== null) return `${draft.headcount} чел.`;
  return ctx.crewSize ? `${ctx.crewSize} чел. (вся бригада)` : "состав не задан";
}

export interface SummaryView {
  rows: [string, string][];
  /** Признаки, с которыми запись уйдёт менеджеру */
  flags: { flag: EntryFlag; text: string }[];
  minutes: number | null;
}

/** Сводка перед отправкой: те же значения, что уйдут в порт */
export function summaryOf(state: BotState, ctx: BotContext): SummaryView {
  const d = state.draft;
  const object = objectOf(ctx, d.objectId);
  const check = draftCheck(ctx, d);
  const flags = check
    ? checkFlags(check).map((flag) => ({
        flag,
        text:
          flag === "overlap"
            ? `${FLAG_LABEL.overlap}: ${check.overlaps.map((o) => `${o.entry.number} ${entryFrame(o.entry)}`).join(", ")}. Запись примем, менеджер увидит пометку.`
            : `${FLAG_LABEL["repeat-visit"]}: на этом объекте сегодня уже ${check.repeatVisits.map((e) => `${e.number} ${entryFrame(e)}`).join(", ")}. Запись примем с пометкой.`,
      }))
    : [];
  const frame = d.start !== null && d.end !== null ? d.end - d.start : null;
  const minutes =
    frame !== null && d.breakMinutes !== null && d.breakMinutes < frame
      ? frame - d.breakMinutes
      : null;
  return {
    rows: [
      ["Объект", object?.label ?? "–"],
      ["День", d.day ? `${d.day === ctx.today ? "Сегодня" : "Вчера"}, ${shortDay(d.day)}` : "–"],
      ["Время", d.start !== null && d.end !== null ? intervalLabel(d.start, d.end) : "–"],
      ["Перерыв", `${d.breakMinutes ?? 0} мин`],
      ["Состав", crewText(ctx, d)],
    ],
    flags,
    minutes,
  };
}

const COMPOSER_FREE = {
  label: "Сообщение боту: объект, день и время одной фразой",
  placeholder: "Например: с 8 до 17",
};

export function botReply(state: BotState, ctx: BotContext): BotReply {
  const { stage, draft, previous, error } = state;
  const busy = busyOf(ctx, draft);
  const reply = (
    r: Omit<BotReply, "composer"> & { composer?: BotReply["composer"] },
  ): BotReply => ({
    composer: COMPOSER_FREE,
    ...r,
    ...(error ? { text: error, danger: true } : {}),
  });

  switch (stage.kind) {
    case "hello": {
      const clarify = clarifyEntries(ctx).length;
      return reply({
        text: `Добрый день, ${ctx.speakerName}. Внесите время по объекту.`,
        hint: "Сумму и виды работ вводить не нужно, только время.",
        groups: [
          {
            keys: [
              { id: "enter", label: "Внести время", tone: "primary" },
              { id: "mine", label: "Мои записи" },
              ...(clarify > 0 ? [{ id: "clarify", label: `Уточнения (${clarify})` }] : []),
            ],
          },
        ],
      });
    }
    case "object":
      return reply({
        text:
          ctx.dayObjects.length > 0
            ? "Выберите объект."
            : "На сегодня объектов не назначено. Нажмите «Другой адрес» и найдите свой.",
        ...(ctx.dayObjects.length > 0
          ? { hint: `Объекты бригады на сегодня, ${shortDay(ctx.today)}.` }
          : {}),
        groups: [
          {
            keys: [
              ...ctx.dayObjects.slice(0, DAY_OBJECTS_MAX).map((o) => ({
                id: `obj:${o.id}`,
                label: o.label,
                ...(o.code ? { sub: o.code } : {}),
                align: "start" as const,
                pick: { kind: "object" as const, value: o.id },
              })),
              { id: "voice", label: "Сказать голосом", tour: "bot-voice" },
              { id: "search", label: "Другой адрес" },
            ],
          },
        ],
      });
    case "search":
      return reply({
        text: "Напишите улицу, населённый пункт или код объекта. Ищу среди объектов бригады.",
        groups: [],
        composer: {
          label: "Сообщение боту: адрес или код объекта",
          placeholder: "Адрес или код объекта",
        },
      });
    case "found":
      return reply({
        text:
          stage.ids.length > 0
            ? `Нашёл ${stage.ids.length === 1 ? "один объект" : `объектов: ${stage.ids.length}`}. Выберите.`
            : `По запросу «${stage.query}» среди объектов бригады ничего нет. Напишите иначе или выберите объект на сегодня.`,
        groups: [
          {
            keys: [
              ...stage.ids
                .map((id) => objectOf(ctx, id))
                .filter((o): o is BotObject => !!o)
                .map((o) => ({
                  id: `obj:${o.id}`,
                  label: o.label,
                  ...(o.code ? { sub: o.code } : {}),
                  align: "start" as const,
                  pick: { kind: "object" as const, value: o.id },
                })),
              { id: "objects", label: "Объекты на сегодня" },
            ],
          },
        ],
        composer: {
          label: "Сообщение боту: адрес или код объекта",
          placeholder: "Адрес или код объекта",
        },
      });
    case "day":
      return reply({
        text: "За какой день?",
        groups: [
          {
            keys: [
              { id: "day:today", label: `Сегодня, ${shortDay(ctx.today)}` },
              {
                id: "day:yesterday",
                label: `Вчера, ${shortDay(ctx.yesterday)}`,
                sub: "внесено позже",
              },
            ],
          },
        ],
      });
    case "time": {
      const check = draftCheck(ctx, { ...draft, start: null, end: null });
      const repeat = check?.repeatVisits.length
        ? ` По этому объекту за день уже есть ${check.repeatVisits.map((e) => `${e.number} (${entryFrame(e)})`).join(", ")}: второй выезд примем с пометкой.`
        : "";
      return reply({
        text: "Во сколько начали?",
        hint:
          (busy.length > 0
            ? `${capital(busyLine(busy))}. Время можно выбрать, менеджер увидит пересечение.`
            : "Или напишите время сообщением: 8-17.") + repeat,
        groups: [
          {
            cols: 2,
            keys: BOT_RANGES.map(([from, to]) => ({
              id: `range:${from}-${to}`,
              label: intervalLabel(from, to),
              previous: previous?.start === from && previous?.end === to,
            })),
          },
          {
            cols: 3,
            keys: startSlots(busy).map((slot) => ({
              id: `start:${slot.minutes}`,
              label: slot.label,
              ...(slot.busy
                ? {
                    sub: `внесено ${slot.busy.number}`,
                    aria: `${slot.label}, уже внесено ${slot.busy.number}`,
                  }
                : {}),
              previous: previous?.start === slot.minutes,
              pick: { kind: "start" as const, value: slot.minutes },
            })),
          },
          { keys: [{ id: "typed", label: "Своё время" }] },
        ],
      });
    }
    case "end":
      return reply({
        text: `Во сколько закончили? Начало ${formatClock(draft.start ?? 0)}.`,
        groups: [
          {
            cols: 3,
            keys: endSlots(busy, draft.start ?? 0).map((slot) => ({
              id: `end:${slot.minutes}`,
              label: slot.label,
              ...(slot.busy
                ? {
                    sub: `внесено ${slot.busy.number}`,
                    aria: `${slot.label}, уже внесено ${slot.busy.number}`,
                  }
                : {}),
              previous: previous?.end === slot.minutes,
              pick: { kind: "end" as const, value: slot.minutes },
            })),
          },
          { keys: [{ id: "typed:end", label: "Своё время" }] },
        ],
        composer: { label: "Время окончания", placeholder: "Например, 16:40" },
      });
    case "typed":
      return reply({
        text:
          stage.field === "end"
            ? "Напишите время окончания, например 16:40."
            : "Напишите время работы: 8-17, с 8:30 до 16 или 830-1700.",
        groups: [],
        composer:
          stage.field === "end"
            ? { label: "Время окончания", placeholder: "Например, 16:40" }
            : { label: "Время работы", placeholder: "8-17" },
      });
    case "check-time":
      return reply({
        text:
          stage.end === null
            ? `Понял: начало ${formatClock(stage.start)}. Верно?`
            : `Понял: ${intervalLabel(stage.start, stage.end)}, ${spanLabel(stage.end - stage.start)}. Верно?`,
        groups: [
          {
            cols: 2,
            keys: [
              { id: "yes", label: "Верно", tone: "primary" },
              { id: "retype", label: "Исправить" },
            ],
          },
        ],
      });
    case "break": {
      const span = (draft.end ?? 0) - (draft.start ?? 0);
      return reply({
        text: "Был перерыв?",
        groups: [
          {
            cols: 3,
            keys: BOT_BREAKS.map((value) => ({
              id: `break:${value}`,
              label: `${value} мин`,
              disabled: value >= span,
              previous: previous?.breakMinutes === value,
              pick: { kind: "break" as const, value },
            })),
          },
        ],
      });
    }
    case "crew": {
      const max = Math.min(CREW_KEYS_MAX, Math.max(ctx.crewSize ?? 1, 1));
      return reply({
        text: "Сколько человек работало?",
        groups: [
          {
            cols: 3,
            keys: Array.from({ length: max }, (_, i) => ({
              id: `crew:${i + 1}`,
              label: `${i + 1} чел.`,
            })),
          },
        ],
      });
    }
    case "summary":
      return reply({
        text: draft.editNumber ? `Проверьте исправление ${draft.editNumber}.` : "Проверьте запись.",
        card: "summary",
        groups: [
          {
            cols: 2,
            keys: [
              { id: "send", label: "Отправить", tone: "primary", tour: "bot-send" },
              { id: "change", label: "Изменить" },
              ...((ctx.crewSize ?? 0) > 1 && !draft.editId
                ? [{ id: "fewer", label: "Меньше людей" }]
                : []),
            ],
          },
        ],
      });
    case "twin":
      return reply({
        text: `Такая запись уже есть: ${stage.number}, ${stage.frame}. Вторую такую же система не примет.`,
        ...(stage.editable ? {} : { hint: "Запись уже у менеджера: исправления вносит он." }),
        groups: [
          {
            keys: [
              stage.editable
                ? {
                    id: `edit:${stage.entryId}`,
                    label: `Открыть ${stage.number}`,
                    tone: "primary" as const,
                  }
                : { id: "mine", label: "Мои записи", tone: "primary" as const },
              { id: "retime", label: "Изменить время" },
              { id: "other", label: "Другой объект" },
            ],
          },
        ],
      });
    case "sending":
      return { text: "Отправляю.", groups: [], composer: null };
    case "failed":
      return {
        text: `Запись не отправлена. ${stage.message}`,
        danger: true,
        groups: [
          {
            keys: [
              { id: "retime", label: "Изменить", tone: "primary" },
              { id: "other", label: "Другой объект" },
            ],
          },
        ],
        composer: COMPOSER_FREE,
      };
    case "done":
      return reply({
        text: stage.edited
          ? `Исправлено и отправлено. Запись ${stage.number} ждёт проверки.`
          : `Отправлено. Запись ${stage.number} ждёт проверки.`,
        groups: [
          {
            keys: [
              { id: "enter:again", label: "Внести ещё адрес", tone: "primary" },
              { id: "mine", label: "Мои записи" },
            ],
          },
        ],
      });
    case "mine": {
      const recent = recentEntries(ctx);
      const editable = recent.filter(editableInBot).slice(0, 3);
      return reply({
        text: recent.length ? "Последние записи бригады:" : "Записей пока нет.",
        ...(recent.length
          ? {}
          : { hint: "Нажмите «Внести время»: запись появится здесь со статусом." }),
        card: "mine",
        groups: [
          {
            keys: [
              ...clarifyEntries(ctx).map((e) => ({
                id: `answer:${e.id}`,
                label: `Ответить по ${e.number}`,
              })),
              ...editable.map((e) => ({ id: `edit:${e.id}`, label: `Изменить ${e.number}` })),
              { id: "enter", label: "Внести время", tone: "primary" as const },
            ],
          },
        ],
      });
    }
    case "answer":
      return reply({
        text: `Напишите ответ менеджеру по ${stage.number}.`,
        groups: [{ keys: [{ id: "mine", label: "Мои записи" }] }],
        composer: { label: "Ответ менеджеру", placeholder: "Например, работали вчетвером" },
      });
    case "answered":
      return reply({
        text: `Ответ по ${stage.number} отправлен менеджеру.`,
        groups: [
          {
            keys: [
              { id: "enter", label: "Внести время", tone: "primary" },
              { id: "mine", label: "Мои записи" },
            ],
          },
        ],
      });
    case "voice":
      return {
        text: "Говорите: объект, день, начало, окончание и перерыв.",
        groups: [],
        composer: {
          label: "Сообщение боту: объект, день и время одной фразой",
          placeholder: "Или напишите текстом",
        },
      };
    case "parsing":
      return { text: "Разбираю фразу.", groups: [], composer: null };
  }
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
