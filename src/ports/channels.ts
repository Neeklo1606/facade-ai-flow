import type { ConnectionStatus, InboundMessage } from "@/contracts";

/**
 * Входящий канал (ADR-039): приём сообщения из Telegram или почты в общий конвейер
 * источника. Порт без реализации канала: заглушка честно говорит, что канал не подключён,
 * и в полевом приложении канала не видно (правило 4).
 */
export interface InboundChannel {
  readonly describe: { channel: InboundMessage["channel"]; connected: boolean };
  /**
   * Разобрать входящее событие канала (вебхук) в сообщение. null — событие не сообщение
   * (служебное, неподдерживаемое) или канал не подключён.
   */
  parse(raw: unknown): Promise<InboundMessage | null>;
}

/** Что подключено на сервере: статусы без значений ключей (ADR-039) */
export interface ConnectionsPort {
  status(): Promise<ConnectionStatus[]>;
}
