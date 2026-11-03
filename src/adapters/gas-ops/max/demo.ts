/**
 * Демо-канал бота (ADR-061, 14): событие приходит уже в общем виде, подписи нет. Нужен
 * тестам обработчика и показу без MAX; в рабочем контуре не используется.
 */
import type { GasInboundChannel, InboundEvent } from "@/ports/messenger";

const KINDS = new Set(["start", "callback", "text"]);

export const demoInbound: GasInboundChannel = {
  channel: "demo",
  configured: true,
  verify: () => true,
  parse: (body) => {
    const event = body as Partial<InboundEvent> | null;
    if (!event || typeof event.externalId !== "string" || typeof event.channelUserId !== "string")
      return null;
    if (!KINDS.has(String(event.kind))) return null;
    return {
      channel: "demo",
      externalId: event.externalId,
      channelUserId: event.channelUserId,
      chatId: event.chatId ?? null,
      kind: event.kind as InboundEvent["kind"],
      payload: typeof event.payload === "string" ? event.payload : "",
      callbackId: event.callbackId ?? null,
    };
  },
};
