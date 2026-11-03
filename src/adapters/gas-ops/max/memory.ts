/**
 * Состояние канала в памяти процесса (ADR-061, 14): тесты и демо. На сервере его место
 * займут таблицы `gas_max_links`, `gas_messenger_sessions`, `gas_inbound_events` (B6).
 */
import type { BotState } from "@/domain/gas-ops/bot-dialog";
import { isNewEvent, type MaxLink } from "@/domain/gas-ops/max-link";
import type { GasMessengerStore } from "@/ports/messenger";

export function createMessengerMemory(initial: MaxLink[] = []): GasMessengerStore & {
  events(): Map<string, string | null>;
} {
  let links = [...initial];
  const sessions = new Map<string, BotState>();
  const events = new Map<string, string | null>();
  return {
    links: async () => links,
    saveLinks: async (next) => {
      links = [...next];
    },
    session: async (channelUserId) => sessions.get(channelUserId) ?? null,
    saveSession: async ({ channelUserId, state }) => {
      sessions.set(channelUserId, state);
    },
    claim: async (event) => {
      if (!isNewEvent(new Set(events.keys()), event.externalId)) return false;
      events.set(event.externalId, null);
      return true;
    },
    record: async (externalId, entryId) => {
      events.set(externalId, entryId);
    },
    events: () => events,
  };
}
