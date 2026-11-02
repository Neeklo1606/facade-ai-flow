/**
 * Исходящие сообщения сотрудникам (ADR-061, 13; раздел 6 документа табеля): напоминания
 * и сводки. Порт с двумя реализациями: демо кладёт сообщение в колокольчик и в ленту бота
 * этой вкладки, MAX появится в T7. Демо прямо помечает, что в MAX ничего не ушло.
 */
export interface OutboundButton {
  label: string;
  to: string;
}

export interface OutboundMessage {
  /** Ключ идемпотентности: повтор с тем же ключом не отправляется второй раз */
  key: string;
  toUserId: string;
  text: string;
  buttons: OutboundButton[];
}

export type OutboundResult = { ok: true; sentAt: string } | { ok: false; reason: string };

export interface OutboundMessenger {
  /** «demo» — сообщение видно только в этой вкладке; «max» — настоящий канал */
  channel: "demo" | "max";
  send(message: OutboundMessage): Promise<OutboundResult>;
}
