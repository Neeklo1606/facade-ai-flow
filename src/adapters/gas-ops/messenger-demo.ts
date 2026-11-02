/**
 * Демо исходящих сообщений (ADR-061, 13): сообщение ложится во входящие этой вкладки
 * (localStorage) — их показывают колокольчик и лента бота. В MAX ничего не уходит.
 */
import type { OutboundMessage, OutboundMessenger } from "@/ports/messenger";

export const INBOX_KEY = "gaika-demo-inbox";

export interface InboxMessage extends OutboundMessage {
  sentAt: string;
}

const listeners = new Set<() => void>();
let cache: InboxMessage[] | null = null;

export function readInbox(): InboxMessage[] {
  if (cache) return cache;
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(INBOX_KEY);
    cache = raw ? (JSON.parse(raw) as InboxMessage[]) : [];
  } catch {
    // Хранилище недоступно: входящие начинаются пустыми
    cache = [];
  }
  return cache;
}

function write(next: InboxMessage[]) {
  cache = next;
  try {
    window.localStorage.setItem(INBOX_KEY, JSON.stringify(next));
  } catch {
    // см. readInbox()
  }
  for (const listener of listeners) listener();
}

export function subscribeInbox(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Сброс демо-данных стирает и входящие */
export function clearInbox() {
  write([]);
}

export const messengerDemo: OutboundMessenger = {
  channel: "demo",
  send: async (message) => {
    const inbox = readInbox();
    const sentAt = new Date().toISOString();
    if (!inbox.some((m) => m.key === message.key)) write([...inbox, { ...message, sentAt }]);
    return { ok: true, sentAt };
  },
};
