/**
 * Исходящие сообщения сотрудникам (ADR-061, 13; раздел 6 документа табеля): напоминания
 * и сводки, ответы бота. Порт с двумя реализациями: демо кладёт сообщение в колокольчик
 * и в ленту бота этой вкладки, MAX — каркас за `MAX_BOT_TOKEN` (T7, ADR-061, 14). Демо прямо
 * помечает, что в MAX ничего не ушло.
 */
import type { BotState } from "@/domain/gas-ops/bot-dialog";
import type { MaxLink } from "@/domain/gas-ops/max-link";

export type OutboundButton =
  /** Ссылка на экран: в демо открывает раздел, в MAX — ссылка на мобильную форму */
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
  /** «demo» — сообщение видно только в этой вкладке; «max» — настоящий канал */
  channel: "demo" | "max";
  send(message: OutboundMessage): Promise<OutboundResult>;
  /** Правка отправленного сообщения: бот убирает кнопки, на которые уже ответили */
  edit?(
    messageId: string,
    message: Omit<OutboundMessage, "key" | "toUserId">,
  ): Promise<OutboundResult>;
}

/* ---------- Входящие (раздел 6, п. 2) ---------- */

/**
 * Событие канала в общем виде: обработчик не знает формата MAX. `externalId` — ключ
 * идемпотентности: повторная доставка того же события не создаёт вторую запись
 */
export interface InboundEvent {
  channel: "max" | "demo";
  externalId: string;
  /** Пользователь в канале, не в системе: связь — по привязке кодом приглашения */
  channelUserId: string;
  chatId: string | null;
  kind: "start" | "callback" | "text";
  /** start — код приглашения или пусто; callback — значение кнопки; text — текст */
  payload: string;
  /** Нажатие кнопки ждёт подтверждения приёма: MAX показывает часики до ответа */
  callbackId: string | null;
}

export interface GasInboundChannel {
  channel: "max" | "demo";
  /** Канал настроен: есть токен бота и секрет подписи. Без этого вебхук отвечает 501 */
  configured: boolean;
  /** Проверить источник запроса: подпись или секрет вебхука */
  verify(request: { headers: Headers }): boolean;
  /** Разобрать тело вебхука; null — событие не для бота (служебное, неподдерживаемое) */
  parse(body: unknown): InboundEvent | null;
}

/**
 * Состояние канала на сервере: привязки, диалоги, принятые события. В базе — таблицы
 * `gas_max_links`, `gas_messenger_sessions`, `gas_inbound_events` (миграция T7); реализация
 * над базой — задача B6, в тестах и демо — память процесса
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
