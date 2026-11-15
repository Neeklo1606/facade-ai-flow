/**
 * Обработчик событий бота бригадира (ADR-061, 14; раздел 6 документа табеля).
 *
 * Событие канала → повтор? → привязка → машина диалога T2 → действие порта → ответ.
 * Канал не важен: MAX, Telegram и демо дают одно и то же `InboundEvent`. Запись создаётся тем же
 * `callGasMethod`, что серверная функция экрана: роль, бригада и выборка ответа те же.
 * Повтор доставки отсекается по внешнему id, повтор «Отправить» — ключом отправки записи.
 */
import { isAutoAccepted } from "@/domain/gas-ops/review-policy";
import { createMaxInbound, createMaxMessenger } from "@/adapters/gas-ops/max/channel";
import {
  TELEGRAM_ID_PREFIX,
  createTelegramInbound,
  createTelegramMessenger,
  resolveTelegramCallback,
} from "@/adapters/gas-ops/telegram/channel";
import type { GasStore } from "@/adapters/gas-ops/store";
import {
  botReply,
  botStep,
  initialBotState,
  type BotContext,
  type BotEffect,
  type BotEvent,
  type BotState,
} from "@/domain/gas-ops/bot-dialog";
import {
  REDEEM_TEXT,
  botContextFor,
  channelReply,
  linkedUserId,
  redeemInvite,
} from "@/domain/gas-ops/max-link";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { GasOpsError } from "@/ports/gas-ops";
import type {
  GasInboundChannel,
  GasMessengerStore,
  InboundEvent,
  MessengerChannel,
  OutboundMessenger,
} from "@/ports/messenger";
import { GasAccessError, callGasMethod } from "./gas-ops-server";
import { appTimeZone, gasServerDriver, gasServerStore } from "./gas-server-store";

export const NOT_LINKED_TEXT =
  "Аккаунт не привязан к сотруднику. Обратитесь к менеджеру: он отправит приглашение.";
export const NOT_FOREMAN_TEXT =
  "Бот принимает время от бригадира. Остальные действия на сайте учёта времени.";

export interface MaxDeps {
  store: GasStore;
  state: GasMessengerStore;
  messenger: OutboundMessenger;
  /** Местное время без пояса: «2026-10-03T18:05:00» */
  now: () => string;
}

export type MaxOutcome =
  | { status: "duplicate" }
  | { status: "not-linked" }
  | { status: "invite-refused"; reason: string }
  | { status: "not-foreman" }
  | { status: "handled"; entryId: string | null };

const toBotEvent = (event: InboundEvent): BotEvent | null =>
  event.kind === "callback"
    ? { type: "key", key: event.payload }
    : event.kind === "text"
      ? { type: "text", text: event.payload }
      : null;

export async function handleInbound(deps: MaxDeps, event: InboundEvent): Promise<MaxOutcome> {
  if (!(await deps.state.claim(event))) return { status: "duplicate" };
  // Нажатие принято: канал убирает часики. Сбой подтверждения не мешает обработке
  if (event.callbackId && deps.messenger.answerCallback) {
    await deps.messenger.answerCallback(event.callbackId).catch(() => undefined);
  }
  // Ответ всегда уходит тому аккаунту, что написал: до привязки пользователя системы нет
  const say = (toUserId: string, text: string, buttons: { label: string; callback: string }[]) =>
    deps.messenger.send({
      key: `reply|${event.externalId}`,
      toUserId,
      toChannelUserId: event.channelUserId,
      text,
      buttons,
    });

  // Запуск по ссылке с кодом: привязка аккаунта
  let links = await deps.state.links();
  const code = event.kind === "start" ? event.payload.trim() : "";
  if (code) {
    const result = redeemInvite(links, {
      code,
      maxUserId: event.channelUserId,
      now: deps.now(),
    });
    if (!result.ok) {
      await say("", REDEEM_TEXT[result.reason], []);
      return { status: "invite-refused", reason: result.reason };
    }
    links = result.links;
    await deps.state.saveLinks(links);
  }

  const userId = linkedUserId(links, event.channelUserId);
  if (!userId) {
    await say("", NOT_LINKED_TEXT, []);
    return { status: "not-linked" };
  }
  const read = async () => {
    const snapshot = await deps.store.read();
    const user = snapshot.users.find((u) => u.id === userId)!;
    return { snapshot, user, ctx: botContextFor(snapshot, user, () => `max-${event.externalId}`) };
  };
  let { snapshot, ctx } = await read();
  if (!ctx) {
    await say(userId, NOT_FOREMAN_TEXT, []);
    return { status: "not-foreman" };
  }

  // Новый запуск начинает диалог сначала; иначе продолжаем с сохранённого шага
  let state: BotState =
    event.kind === "start"
      ? initialBotState(ctx)
      : ((await deps.state.session(event.channelUserId)) ?? initialBotState(ctx));
  const notes: string[] = [];
  let entryId: string | null = null;
  const botEvent = toBotEvent(resolveCallback(event, state, ctx));
  if (botEvent) {
    const step = botStep(state, botEvent, ctx);
    notes.push(...step.notes);
    state = step.state;
    if (step.effect) {
      const answer = await perform(deps.store, userId, snapshot, ctx.brigadeId, step.effect);
      if (answer.ok && answer.entry) entryId = answer.entry.id;
      ({ snapshot, ctx } = await read());
      const after = botStep(
        state,
        answer.ok
          ? {
              type: "sent",
              number: answer.entry?.number ?? "",
              auto: answer.entry ? isAutoAccepted(answer.entry) : false,
            }
          : { type: "failed", message: answer.message },
        ctx!,
      );
      notes.push(...after.notes);
      state = after.state;
    }
  }
  await deps.state.saveSession({
    channelUserId: event.channelUserId,
    userId,
    chatId: event.chatId,
    state,
  });
  if (entryId) await deps.state.record(event.externalId, entryId);
  const reply = channelReply(botReply(state, ctx!), state, ctx!);
  await say(userId, [...notes, reply.text].join("\n"), reply.buttons);
  return { status: "handled", entryId };
}

/**
 * Telegram ограничивает значение кнопки 64 байтами: длинное уходит отпечатком (см.
 * telegramCallbackData) и находится среди кнопок текущего шага. Не нашлось — кнопка
 * устарела, событие проходит пустым нажатием, и бот повторяет текущий шаг
 */
function resolveCallback(event: InboundEvent, state: BotState, ctx: BotContext): InboundEvent {
  if (event.kind !== "callback" || event.channel !== "telegram") return event;
  const keys = channelReply(botReply(state, ctx), state, ctx).buttons.map((b) => b.callback);
  return { ...event, payload: resolveTelegramCallback(event.payload, keys) ?? "" };
}

type Performed = { ok: true; entry: TimeEntry | null } | { ok: false; message: string };

/** Действие машины диалога через серверный вызов порта: те же права, что у экрана */
async function perform(
  store: GasStore,
  userId: string,
  snapshot: { employees: { id: string; brigadeId: string; isLead?: boolean }[] },
  brigadeId: string,
  effect: BotEffect,
): Promise<Performed> {
  const call = (method: string, args: unknown[]) =>
    callGasMethod({ store, userId, method, args }) as Promise<TimeEntry>;
  try {
    if (effect.kind === "answer") {
      await call("answerClarify", [{ id: effect.id, text: effect.text }]);
      return { ok: true, entry: null };
    }
    if (effect.kind === "update") {
      let entry = await call("updateEntry", [
        { id: effect.id, start: effect.start, end: effect.end, breakMinutes: effect.breakMinutes },
      ]);
      if (effect.resubmit) entry = await call("submitEntry", [effect.id]);
      return { ok: true, entry };
    }
    const lead = snapshot.employees.find((e) => e.brigadeId === brigadeId && e.isLead);
    const entry = await call("createEntry", [
      {
        day: effect.day,
        brigadeId,
        employeeId: lead?.id ?? null,
        objectId: effect.objectId,
        start: effect.start,
        end: effect.end,
        breakMinutes: effect.breakMinutes,
        submit: true,
        ...(effect.headcount !== null ? { headcount: effect.headcount } : {}),
        clientKey: effect.clientKey,
        channel: "bot",
      },
    ]);
    return { ok: true, entry };
  } catch (error) {
    if (error instanceof GasOpsError || error instanceof GasAccessError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/* ---------------------------------------------------------------- Вебхук */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const CHANNEL_NAME: Record<MessengerChannel, string> = {
  demo: "демо",
  max: "MAX",
  telegram: "Telegram",
};

/**
 * Ответ вебхука канала (`/api/max/webhook`, `/api/telegram/webhook`). Пока канал или
 * хранилище диалогов не настроены — 501: канал не получает «успех» за событие, которое
 * никто не обработал
 */
export async function maxWebhookResponse(
  request: Request,
  inbound: GasInboundChannel,
  deps: MaxDeps | null,
): Promise<Response> {
  if (!inbound.configured || !deps) {
    return json(501, {
      code: "not-configured",
      message: `Канал ${CHANNEL_NAME[inbound.channel]} не настроен.`,
    });
  }
  if (!inbound.verify(request)) {
    return json(401, { code: "bad-signature", message: "Источник запроса не подтверждён." });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad-request", message: "Тело запроса не JSON." });
  }
  const event = inbound.parse(body);
  if (!event) return json(200, { ok: true, ignored: true });
  return json(200, { ok: true, ...(await handleInbound(deps, event)) });
}

/** Местное время без пояса в поясе сервера: «2026-10-03T18:05:00» */
export function localNow(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/** Аккаунт канала из привязок: Telegram — с префиксом `tg:`, MAX — без него */
const ofChannel = (channel: "max" | "telegram", accountId: string) =>
  accountId.startsWith(TELEGRAM_ID_PREFIX) === (channel === "telegram");

/**
 * Рабочие зависимости обработчика: хранилище учёта времени и состояние канала над базой
 * (B6), отправка в тот же канал. null — нет базы: вебхук отвечает 501
 */
async function serverDeps(channel: "max" | "telegram"): Promise<MaxDeps | null> {
  const [store, db] = await Promise.all([gasServerStore(), gasServerDriver()]);
  if (!store || !db) return null;
  const { createMessengerDb } = await import("@/adapters/gas-ops/messenger-db");
  const timeZone = appTimeZone();
  const state = createMessengerDb(db, { timeZone });
  const channelUserOf = async (userId: string) =>
    (await state.links()).find(
      (l) => l.userId === userId && l.maxUserId !== null && ofChannel(channel, l.maxUserId),
    )?.maxUserId ?? null;
  const env = process.env;
  const messenger =
    channel === "telegram"
      ? createTelegramMessenger({ env, channelUserOf })
      : createMaxMessenger({ env, channelUserOf });
  return { store, state, messenger, now: () => localNow(timeZone) };
}

/** Вебхук MAX рабочего контура: канал из окружения сервера, состояние диалогов в базе */
export async function maxWebhook(request: Request): Promise<Response> {
  const inbound = createMaxInbound(process.env);
  return maxWebhookResponse(request, inbound, inbound.configured ? await serverDeps("max") : null);
}

/** Вебхук Telegram рабочего контура: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, база */
export async function telegramWebhook(request: Request): Promise<Response> {
  const inbound = createTelegramInbound(process.env);
  return maxWebhookResponse(
    request,
    inbound,
    inbound.configured ? await serverDeps("telegram") : null,
  );
}
