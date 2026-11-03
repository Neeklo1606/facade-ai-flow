/**
 * Канал MAX: каркас без ключей (ADR-061, 14; раздел 6 документа табеля).
 *
 * Включается переменными окружения сервера `MAX_BOT_TOKEN` и `MAX_WEBHOOK_SECRET`. Без них
 * канал не настроен: вебхук отвечает 501, отправка возвращает «не настроен», а интерфейс
 * пишет «канал MAX не подключён».
 *
 * Имена полей событий, адреса методов и заголовок секрета взяты из открытых описаний
 * клиентских библиотек (раздел 6) и НЕ сверены с dev.max.ru: сверяет Сергей по документации
 * и тестовому боту (B6). Места для сверки помечены «сверить».
 */
import type {
  GasInboundChannel,
  InboundEvent,
  OutboundMessage,
  OutboundMessenger,
  OutboundResult,
} from "@/ports/messenger";

/** сверить: адрес API */
export const MAX_API = "https://platform-api.max.ru";
/** сверить: заголовок, в котором MAX присылает секрет подписки на вебхук */
export const MAX_SECRET_HEADER = "x-max-bot-api-secret";

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

/**
 * Событие MAX → общее событие. сверить: `update_type` и поля
 * `bot_started`, `message_callback`, `message_created`
 */
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

/** Тело сообщения MAX с кнопками. сверить: `attachments`, `inline_keyboard`, вид кнопок */
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
      // сверить: адресат параметром user_id
      return request(
        "POST",
        `/messages?user_id=${encodeURIComponent(to)}`,
        maxMessageBody(message),
      );
    },
    edit: async (messageId, message): Promise<OutboundResult> => {
      if (!token) return { ok: false, reason: "Канал MAX не настроен." };
      // сверить: правка методом PUT с message_id
      return request(
        "PUT",
        `/messages?message_id=${encodeURIComponent(messageId)}`,
        maxMessageBody(message),
      );
    },
  };
}
