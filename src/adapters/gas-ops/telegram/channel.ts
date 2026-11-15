/**
 * Канал Telegram: второй мессенджер бота бригадира рядом с MAX, за теми же портами
 * (src/ports/messenger.ts). Формат событий и методы — Telegram Bot API (core.telegram.org/bots/api).
 *
 * Включается переменными окружения сервера `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET`.
 * Секрет передаётся в `setWebhook` параметром `secret_token`, Telegram присылает его в каждом
 * запросе заголовком `X-Telegram-Bot-Api-Secret-Token`. Без обеих переменных канал не настроен:
 * вебхук отвечает 501, отправка возвращает «не настроен».
 *
 * Аккаунты Telegram и MAX лежат в общих таблицах, поэтому id пользователя Telegram пишется
 * с префиксом `tg:` (`tg:123456`), а внешний id события — `tg:update:<update_id>`. Бот работает
 * только в личном чате: там id чата совпадает с id пользователя, ответ уходит по нему.
 * Токен бота входит в адрес метода: адрес и токен не пишутся в журнал.
 */
import type {
  GasInboundChannel,
  InboundEvent,
  OutboundMessage,
  OutboundMessenger,
  OutboundResult,
} from "@/ports/messenger";

export const TELEGRAM_API = "https://api.telegram.org";
/** Заголовок с секретом вебхука (параметр `secret_token` метода `setWebhook`) */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";
/** Префикс id аккаунта Telegram в общих таблицах канала */
export const TELEGRAM_ID_PREFIX = "tg:";
/** Предел `callback_data` в Telegram: 1–64 байта */
export const TELEGRAM_CALLBACK_LIMIT = 64;
/** Предел текста сообщения в Telegram: 4096 символов */
export const TELEGRAM_TEXT_LIMIT = 4096;
/** Метка сжатого значения кнопки: длинное значение заменяется отпечатком (см. telegramCallbackData) */
export const TELEGRAM_HASHED_PREFIX = "#";

/** Окружение сервера: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` */
export type TelegramEnv = Record<string, string | undefined>;

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

/** id аккаунта Telegram в общих таблицах: `tg:123456` */
export const telegramUserId = (id: string) => `${TELEGRAM_ID_PREFIX}${id}`;

/** id чата Telegram из id аккаунта; null — аккаунт не из Telegram */
export function telegramChatOf(channelUserId: string): string | null {
  if (!channelUserId.startsWith(TELEGRAM_ID_PREFIX)) return null;
  const id = channelUserId.slice(TELEGRAM_ID_PREFIX.length);
  return /^-?\d+$/.test(id) ? id : null;
}

const utf8 = (value: string) => new TextEncoder().encode(value);

/** Отпечаток FNV-1a двумя 32-битными проходами: 16 шестнадцатеричных знаков, без сети и node */
function fingerprint(value: string): string {
  const bytes = utf8(value);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (const byte of bytes) {
    a = Math.imul(a ^ byte, 0x01000193) >>> 0;
    b = Math.imul(b ^ byte, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Значение кнопки для `callback_data`. Кнопки машины диалога короткие (`send`, `break:30`),
 * но в часть входят id объектов и записей (`answer:<id>`, `edit:<id>`): если значение длиннее
 * 64 байт, вместо него уходит отпечаток `#<16 знаков>`. Обработчик находит исходное значение
 * среди кнопок текущего шага диалога (`resolveTelegramCallback`); устаревшая кнопка не находится
 * и ничего не делает
 */
export function telegramCallbackData(callback: string): string {
  if (utf8(callback).length <= TELEGRAM_CALLBACK_LIMIT && !callback.startsWith("#")) {
    return callback;
  }
  return `${TELEGRAM_HASHED_PREFIX}${fingerprint(callback)}`;
}

/** Исходное значение кнопки по `callback_data`: несжатое — как есть, отпечаток — среди кандидатов */
export function resolveTelegramCallback(
  data: string,
  candidates: readonly string[],
): string | null {
  if (!data.startsWith(TELEGRAM_HASHED_PREFIX)) return data;
  return candidates.find((c) => telegramCallbackData(c) === data) ?? null;
}

/** Команда запуска: `/start`, `/start КОД`, `/start@ИмяБота КОД`. null — не команда запуска */
function startPayload(value: string): string | null {
  const match = /^\/start(?:@\w+)?(?:\s+(.*))?$/s.exec(value.trim());
  return match ? (match[1] ?? "").trim() : null;
}

/**
 * Обновление Telegram → общее событие. Обрабатываются `message` с текстом в личном чате
 * (`/start` с кодом — запуск, остальное — текст) и `callback_query` с `data`.
 * Всё остальное (группы, фото, правки, служебные) — null: событие не для бота
 */
export function parseTelegramUpdate(body: unknown): InboundEvent | null {
  const update = text(field(body, "update_id"));
  if (!update) return null;
  const externalId = `tg:update:${update}`;

  const query = field(body, "callback_query");
  if (query && typeof query === "object") {
    const id = text(field(query, "id"));
    const user = text(field(query, "from", "id"));
    const data = text(field(query, "data"));
    if (!id || !user || data === null) return null;
    return {
      channel: "telegram",
      externalId,
      channelUserId: telegramUserId(user),
      chatId: text(field(query, "message", "chat", "id")),
      kind: "callback",
      payload: data,
      callbackId: id,
    };
  }

  const message = field(body, "message");
  if (message && typeof message === "object") {
    if (field(message, "chat", "type") !== "private") return null;
    const user = text(field(message, "from", "id"));
    const value = text(field(message, "text"));
    if (!user || value === null) return null;
    const start = startPayload(value);
    return {
      channel: "telegram",
      externalId,
      channelUserId: telegramUserId(user),
      chatId: text(field(message, "chat", "id")),
      kind: start === null ? "text" : "start",
      payload: start ?? value,
      callbackId: null,
    };
  }
  return null;
}

export function createTelegramInbound(env: TelegramEnv): GasInboundChannel {
  const token = env["TELEGRAM_BOT_TOKEN"]?.trim() ?? "";
  const secret = env["TELEGRAM_WEBHOOK_SECRET"]?.trim() ?? "";
  return {
    channel: "telegram",
    configured: token !== "" && secret !== "",
    verify: ({ headers }) =>
      secret !== "" && same(headers.get(TELEGRAM_SECRET_HEADER) ?? "", secret),
    parse: parseTelegramUpdate,
  };
}

const isAbsoluteUrl = (value: string) => /^(https?|tg):\/\//i.test(value);

/**
 * Текст и клавиатура сообщения Telegram (`InlineKeyboardMarkup`): кнопка ответа —
 * `callback_data`, ссылка — `url`. Ссылка без адреса сайта (`/gas/tabel`) Telegram не примет
 * и откажет во всём сообщении, поэтому такая кнопка не уходит
 */
/** Кнопка `InlineKeyboardButton`: ответ боту или ссылка */
export type TelegramButton =
  { text: string; callback_data: string } | { text: string; url: string };

export function telegramMessageBody(message: Omit<OutboundMessage, "key" | "toUserId">) {
  const rows = message.buttons.flatMap((b): TelegramButton[][] =>
    "callback" in b
      ? [[{ text: b.label, callback_data: telegramCallbackData(b.callback) }]]
      : isAbsoluteUrl(b.to)
        ? [[{ text: b.label, url: b.to }]]
        : [],
  );
  const value =
    message.text.length > TELEGRAM_TEXT_LIMIT
      ? `${message.text.slice(0, TELEGRAM_TEXT_LIMIT - 1)}…`
      : message.text;
  return {
    text: value,
    ...(rows.length ? { reply_markup: { inline_keyboard: rows } } : {}),
  };
}

export interface TelegramMessengerOptions {
  env: TelegramEnv;
  /** Аккаунт Telegram пользователя системы (`tg:…`): из привязок `gas_max_links` */
  channelUserOf: (userId: string) => Promise<string | null>;
  fetch?: typeof fetch;
  now?: () => string;
}

/**
 * Отправка в Telegram. Ключ отправленного сообщения — `<chat_id>:<message_id>`: по нему
 * `editMessageText` правит сообщение. Без токена ничего не уходит
 */
export function createTelegramMessenger(options: TelegramMessengerOptions): OutboundMessenger {
  const token = options.env["TELEGRAM_BOT_TOKEN"]?.trim() ?? "";
  const http = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const call = async (method: string, body: unknown) => {
    try {
      const response = await http(`${TELEGRAM_API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || field(data, "ok") !== true) {
        // Описание ошибки Telegram не содержит токена: его можно показать в причине
        const description = text(field(data, "description"));
        return {
          ok: false as const,
          reason: `Telegram ответил ${response.status}${description ? `: ${description}` : ""}`,
        };
      }
      return { ok: true as const, data };
    } catch {
      // Текст ошибки сети может содержать адрес с токеном: наружу только общий ответ
      return { ok: false as const, reason: "Telegram недоступен." };
    }
  };
  return {
    channel: "telegram",
    send: async (message): Promise<OutboundResult> => {
      if (!token) return { ok: false, reason: "Канал Telegram не настроен." };
      const to = message.toChannelUserId ?? (await options.channelUserOf(message.toUserId));
      const chatId = to ? telegramChatOf(to) : null;
      if (!chatId) return { ok: false, reason: "Сотрудник не привязан к Telegram." };
      const result = await call("sendMessage", {
        chat_id: chatId,
        ...telegramMessageBody(message),
      });
      if (!result.ok) return result;
      const messageId = text(field(result.data, "result", "message_id"));
      return {
        ok: true,
        sentAt: now(),
        ...(messageId ? { messageId: `${chatId}:${messageId}` } : {}),
      };
    },
    edit: async (messageId, message): Promise<OutboundResult> => {
      if (!token) return { ok: false, reason: "Канал Telegram не настроен." };
      const at = messageId.lastIndexOf(":");
      const chatId = messageId.slice(0, at);
      const id = messageId.slice(at + 1);
      if (at <= 0 || !/^\d+$/.test(id)) return { ok: false, reason: "Неверный ключ сообщения." };
      const body = telegramMessageBody(message);
      const result = await call("editMessageText", {
        chat_id: chatId,
        message_id: Number(id),
        text: body.text,
        // Без кнопок клавиатура убирается: пустой список рядов
        reply_markup: body.reply_markup ?? { inline_keyboard: [] },
      });
      if (!result.ok) return result;
      return { ok: true, sentAt: now(), messageId };
    },
    answerCallback: async (callbackId) => {
      if (!token) return;
      await call("answerCallbackQuery", { callback_query_id: callbackId });
    },
  };
}
