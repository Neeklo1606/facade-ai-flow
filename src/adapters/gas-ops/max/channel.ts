/**
 * Канал MAX: каркас без ключей (ADR-061, 14; раздел 6 документа табеля).
 *
 * Включается переменными окружения сервера `MAX_BOT_TOKEN` и `MAX_WEBHOOK_SECRET`. Без них
 * канал не настроен: вебхук отвечает 501, отправка возвращает «не настроен», а интерфейс
 * пишет «канал MAX не подключён».
 *
 * Адрес API, заголовок токена, поля событий `bot_started`, `message_callback`,
 * `message_created`, параметры `user_id` и `message_id`, вид клавиатуры и заголовок секрета
 * вебхука сверены с dev.max.ru 23.11.2026 (ADR-085). Живым ботом не проверено: токена нет.
 */
import type {
  GasInboundChannel,
  InboundEvent,
  OutboundMessage,
  OutboundMessenger,
  OutboundResult,
} from "@/ports/messenger";

/**
 * Адрес API. Документация dev.max.ru просит слать запросы на platform-api2, а не на
 * старый platform-api (ADR-085)
 */
export const MAX_API = "https://platform-api2.max.ru";
/** Заголовок, в котором MAX присылает секрет подписки (`X-Max-Bot-Api-Secret`) */
export const MAX_SECRET_HEADER = "x-max-bot-api-secret";
/** Путь вебхука сервиса: его адрес подписывают в MAX (`POST /subscriptions`) */
export const MAX_WEBHOOK_PATH = "/api/max/webhook";

/** Окружение сервера: `MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET` */
export type MaxEnv = Record<string, string | undefined>;

const field = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (at, key) => (at && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined),
    value,
  );

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : null;

/** Сравнение секрета без раннего выхода: время ответа не подсказывает совпавшие символы */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Событие MAX → общее событие: `update_type` и поля трёх событий по объекту Update */
export function parseMaxUpdate(body: unknown): InboundEvent | null {
  const type = field(body, "update_type");
  if (type === "bot_started") {
    const user = text(field(body, "user", "user_id"));
    if (!user) return null;
    const at = text(field(body, "timestamp")) ?? "";
    return {
      channel: "max",
      externalId: `start:${user}:${at}`,
      channelUserId: user,
      chatId: text(field(body, "chat_id")),
      kind: "start",
      payload: text(field(body, "payload")) ?? "",
      callbackId: null,
    };
  }
  if (type === "message_callback") {
    const id = text(field(body, "callback", "callback_id"));
    const user = text(field(body, "callback", "user", "user_id"));
    if (!id || !user) return null;
    return {
      channel: "max",
      externalId: `callback:${id}`,
      channelUserId: user,
      chatId: text(field(body, "message", "recipient", "chat_id")),
      kind: "callback",
      payload: text(field(body, "callback", "payload")) ?? "",
      callbackId: id,
    };
  }
  if (type === "message_created") {
    const id = text(field(body, "message", "body", "mid"));
    const user = text(field(body, "message", "sender", "user_id"));
    const value = text(field(body, "message", "body", "text"));
    if (!id || !user || value === null) return null;
    return {
      channel: "max",
      externalId: `message:${id}`,
      channelUserId: user,
      chatId: text(field(body, "message", "recipient", "chat_id")),
      kind: "text",
      payload: value,
      callbackId: null,
    };
  }
  return null;
}

export function createMaxInbound(env: MaxEnv): GasInboundChannel {
  const token = env["MAX_BOT_TOKEN"]?.trim() ?? "";
  const secret = env["MAX_WEBHOOK_SECRET"]?.trim() ?? "";
  return {
    channel: "max",
    configured: token !== "" && secret !== "",
    verify: ({ headers }) => secret !== "" && same(headers.get(MAX_SECRET_HEADER) ?? "", secret),
    parse: parseMaxUpdate,
  };
}

/** Тело сообщения MAX с кнопками: вложение `inline_keyboard`, кнопки `callback` и `link` */
export function maxMessageBody(message: Omit<OutboundMessage, "key" | "toUserId">) {
  const rows = message.buttons.map((b) =>
    "callback" in b
      ? [{ type: "callback", text: b.label, payload: b.callback }]
      : [{ type: "link", text: b.label, url: b.to }],
  );
  return {
    text: message.text,
    ...(rows.length
      ? { attachments: [{ type: "inline_keyboard", payload: { buttons: rows } }] }
      : {}),
  };
}

export interface MaxMessengerOptions {
  env: MaxEnv;
  /** Аккаунт MAX пользователя системы: из привязок `gas_max_links` */
  channelUserOf: (userId: string) => Promise<string | null>;
  fetch?: typeof fetch;
  now?: () => string;
}

/** Отправка в MAX. Без токена ничего не уходит, ответ прямо говорит, что канал не настроен */
export function createMaxMessenger(options: MaxMessengerOptions): OutboundMessenger {
  const token = options.env["MAX_BOT_TOKEN"]?.trim() ?? "";
  const http = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const request = async (method: "POST" | "PUT", path: string, body: unknown) => {
    const response = await http(`${MAX_API}${path}`, {
      method,
      headers: { Authorization: token, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false as const, reason: `MAX ответил ${response.status}` };
    const data = (await response.json().catch(() => null)) as unknown;
    const messageId = text(field(data, "message", "body", "mid"));
    return { ok: true as const, sentAt: now(), ...(messageId ? { messageId } : {}) };
  };
  return {
    channel: "max",
    send: async (message): Promise<OutboundResult> => {
      if (!token) return { ok: false, reason: "Канал MAX не настроен." };
      const to = message.toChannelUserId ?? (await options.channelUserOf(message.toUserId));
      if (!to) return { ok: false, reason: "Сотрудник не привязан к MAX." };
      return request(
        "POST",
        `/messages?user_id=${encodeURIComponent(to)}`,
        maxMessageBody(message),
      );
    },
    edit: async (messageId, message): Promise<OutboundResult> => {
      if (!token) return { ok: false, reason: "Канал MAX не настроен." };
      return request(
        "PUT",
        `/messages?message_id=${encodeURIComponent(messageId)}`,
        maxMessageBody(message),
      );
    },
  };
}

/* ---------------------------------------------------------- Проверка канала */

/** Строка проверки канала для «Подключений»: что проверено и что ответил MAX */
export interface MaxCheckLine {
  name: string;
  ok: boolean;
  text: string;
}

export interface MaxCheckOptions {
  env: MaxEnv;
  /** Полный адрес вебхука этого сервиса: `https://домен/api/max/webhook` */
  webhookUrl: string;
  fetch?: typeof fetch;
}

/** Секрет подписки по правилам MAX: 5-256 символов, латиница, цифры и дефис */
export const isMaxSecret = (secret: string) => /^[A-Za-z0-9-]{5,256}$/.test(secret);

/**
 * Проверка канала без отправки сообщений: токен (`GET /me`), подписка вебхука на адрес
 * сервиса (`GET /subscriptions`) и вид секрета. Ничего не меняет в MAX. Без токена строк нет:
 * канал не подключён, проверять нечего
 */
export async function checkMaxChannel(options: MaxCheckOptions): Promise<MaxCheckLine[]> {
  const token = options.env["MAX_BOT_TOKEN"]?.trim() ?? "";
  const secret = options.env["MAX_WEBHOOK_SECRET"]?.trim() ?? "";
  if (!token) return [];
  const http = options.fetch ?? fetch;
  const get = async (path: string) => {
    try {
      const response = await http(`${MAX_API}${path}`, {
        method: "GET",
        headers: { Authorization: token },
      });
      const data = (await response.json().catch(() => null)) as unknown;
      return { status: response.status, data };
    } catch {
      return { status: 0, data: null };
    }
  };
  const lines: MaxCheckLine[] = [];

  const me = await get("/me");
  if (me.status !== 200) {
    lines.push({
      name: "Токен бота",
      ok: false,
      text:
        me.status === 401
          ? "MAX не принял токен (401). Скопируйте токен заново в настройках бота"
          : me.status === 0
            ? "MAX не ответил: нет связи с platform-api2.max.ru"
            : `MAX ответил ${me.status}`,
    });
    // Без принятого токена подписки не прочитать
    return lines;
  }
  const nick = text(field(me.data, "username"));
  lines.push({
    name: "Токен бота",
    ok: true,
    text: nick ? `MAX принял токен: бот @${nick}` : "MAX принял токен",
  });

  const subs = await get("/subscriptions");
  const list = field(subs.data, "subscriptions");
  const urls = Array.isArray(list)
    ? list.map((s) => text(field(s, "url"))).filter((u): u is string => u !== null)
    : [];
  const want = options.webhookUrl;
  lines.push(
    subs.status !== 200
      ? { name: "Вебхук", ok: false, text: `Подписки не прочитаны: MAX ответил ${subs.status}` }
      : urls.includes(want)
        ? { name: "Вебхук", ok: true, text: `MAX шлёт события на ${want}` }
        : urls.length
          ? {
              name: "Вебхук",
              ok: false,
              text: `Подписка на другой адрес: ${urls.join(", ")}. Нужен ${want}`,
            }
          : {
              name: "Вебхук",
              ok: false,
              text: `Подписки нет: сообщения бригадиров не дойдут. Подпишите ${want}`,
            },
  );

  lines.push({
    name: "Секрет вебхука",
    ok: isMaxSecret(secret),
    text: isMaxSecret(secret)
      ? "Задан. MAX не показывает секрет подписки: совпадение видно по первому событию без ошибки 401"
      : "Не подходит MAX: нужно 5-256 символов, латиница, цифры и дефис",
  });
  return lines;
}

/** Текст тестового сообщения: короткий, без данных учёта */
export const MAX_TEST_TEXT = "Проверка связи из ГАЙКИ: канал MAX работает. Отвечать не нужно.";
