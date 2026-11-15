/**
 * Исходящие сообщения сотрудникам (ADR-061, 13; раздел 6 документа табеля): напоминания
 * и сводки, ответы бота. Порт с реализациями: демо кладёт сообщение в колокольчик
 * и в ленту бота этой вкладки, MAX — каркас за `MAX_BOT_TOKEN` (T7, ADR-061, 14), Telegram —
 * Bot API за `TELEGRAM_BOT_TOKEN`. Демо прямо помечает, что в канал ничего не ушло.
 *
 * Аккаунты каналов лежат в общих таблицах (`gas_max_links.max_user_id`,
 * `gas_messenger_sessions.max_user_id`, `gas_inbound_events.max_user_id`), поэтому id канала
 * без пересечений: MAX — как есть (числовой user_id), Telegram — с префиксом `tg:`
 * (`tg:123456`). Внешние id событий Telegram тоже начинаются с `tg:`.
 */
import type { BotState } from "@/domain/gas-ops/bot-dialog";
import type { MaxLink } from "@/domain/gas-ops/max-link";

/** Каналы бота: демо этой вкладки и настоящие мессенджеры */
export type MessengerChannel = "demo" | "max" | "telegram";

export type OutboundButton =
  /** Ссылка на экран: в демо открывает раздел, в мессенджере — ссылка на мобильную форму */
  | { label: string; to: string }
  /** Кнопка ответа боту: нажатие приходит событием `callback` с этим значением */
  | { label: string; callback: string };

export interface OutboundMessage {
  /** Ключ идемпотентности: повтор с тем же ключом не отправляется второй раз */
  key: string;
  toUserId: string;
  /**
   * Аккаунт в канале, если ответ идёт тому, кто написал (бот отвечает в тот же чат,
   * в том числе до привязки, когда пользователя системы ещё нет)
   */
  toChannelUserId?: string | undefined;
  text: string;
  buttons: OutboundButton[];
}

export type OutboundResult =
  | {
      ok: true;
      sentAt: string;
      /** Ключ сообщения в канале: по нему его правят (кнопки после нажатия) */
      messageId?: string;
    }
  | { ok: false; reason: string };

export interface OutboundMessenger {
  /** «demo» — сообщение видно только в этой вкладке; «max», «telegram» — настоящий канал */
  channel: MessengerChannel;
  send(message: OutboundMessage): Promise<OutboundResult>;
  /** Правка отправленного сообщения: бот убирает кнопки, на которые уже ответили */
  edit?(
    messageId: string,
    message: Omit<OutboundMessage, "key" | "toUserId">,
  ): Promise<OutboundResult>;
  /**
   * Подтвердить приём нажатия кнопки: канал перестаёт показывать часики. Ошибка не мешает
   * обработке события, поэтому результат не возвращается
   */
  answerCallback?(callbackId: string): Promise<void>;
}

/* ---------- Входящие (раздел 6, п. 2) ---------- */

/**
 * Событие канала в общем виде: обработчик не знает формата MAX или Telegram. `externalId` — ключ
 * идемпотентности: повторная доставка того же события не создаёт вторую запись
 */
export interface InboundEvent {
  channel: MessengerChannel;
  externalId: string;
  /** Пользователь в канале, не в системе: связь — по привязке кодом приглашения */
  channelUserId: string;
  chatId: string | null;
  kind: "start" | "callback" | "text";
  /** start — код приглашения или пусто; callback — значение кнопки; text — текст */
  payload: string;
  /** Нажатие кнопки ждёт подтверждения приёма: канал показывает часики до ответа */
  callbackId: string | null;
}

export interface GasInboundChannel {
  channel: MessengerChannel;
  /** Канал настроен: есть токен бота и секрет подписи. Без этого вебхук отвечает 501 */
  configured: boolean;
  /** Проверить источник запроса: подпись или секрет вебхука */
  verify(request: { headers: Headers }): boolean;
  /** Разобрать тело вебхука; null — событие не для бота (служебное, неподдерживаемое) */
  parse(body: unknown): InboundEvent | null;
}

/**
 * Состояние канала на сервере: привязки, диалоги, принятые события. В базе — таблицы
 * `gas_max_links`, `gas_messenger_sessions`, `gas_inbound_events` (миграция T7): реализация
 * над базой — src/adapters/gas-ops/messenger-db.ts (B6), в тестах и демо — память процесса.
 * Таблицы общие для MAX и Telegram: id аккаунта Telegram с префиксом `tg:`
 */
export interface GasMessengerStore {
  links(): Promise<MaxLink[]>;
  saveLinks(links: MaxLink[]): Promise<void>;
  session(channelUserId: string): Promise<BotState | null>;
  saveSession(input: {
    channelUserId: string;
    userId: string;
    chatId: string | null;
    state: BotState;
  }): Promise<void>;
  /** Занять внешний id события; false — его уже принимали (повтор доставки) */
  claim(event: InboundEvent): Promise<boolean>;
  /** Отметить запись, созданную событием: журнал для разбора */
  record(externalId: string, entryId: string): Promise<void>;
}
