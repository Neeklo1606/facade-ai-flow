import type { Lead, LeadSendResult, LeadSink } from "@/ports/leads";

/**
 * Адаптеры заявок (ADR-051). Ключи только в окружении хостинга. Ответ внешнего сервиса
 * и текст ошибки наружу не уходят: в журнал пишет маршрут, и без персональных данных.
 */
export const LEAD_TIMEOUT_MS = 8000;

type Fetch = typeof fetch;

async function post(fetcher: Fetch, url: string, body: unknown): Promise<LeadSendResult> {
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LEAD_TIMEOUT_MS),
    });
    return response.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

const SOURCE_LABEL: Record<Lead["source"], string> = {
  landing: "лендинг",
  razbor: "экспресс-разбор",
  "demo-final": "финал демо",
  case: "кейс",
};

/** Текст сообщения владельцу в Telegram: без разметки, чтобы имя не сломало формат */
export function leadTelegramText(lead: Lead): string {
  return [
    "Заявка с сайта ГАЙКИ",
    `Имя: ${lead.name}`,
    `Компания: ${lead.company || "не указана"}`,
    `Телефон: ${lead.phone}`,
    `Бригад: ${lead.crews}`,
    `Источник: ${SOURCE_LABEL[lead.source]}`,
    lead.src ? `Партнёр: ${lead.src}` : null,
    lead.page ? `Страница: ${lead.page}` : null,
    `Время: ${lead.at}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function telegramLeadSink(token: string, chatId: string, fetcher: Fetch = fetch): LeadSink {
  return {
    kind: "telegram",
    send: (lead) =>
      post(fetcher, `https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: leadTelegramText(lead),
        disable_web_page_preview: true,
      }),
  };
}

export function webhookLeadSink(url: string, fetcher: Fetch = fetch): LeadSink {
  return { kind: "webhook", send: (lead) => post(fetcher, url, lead) };
}

export const noneLeadSink: LeadSink = {
  kind: "none",
  send: async () => ({ ok: false, reason: "not-configured" }),
};

/** Выбор по окружению: Telegram, если есть токен и чат, иначе вебхук, иначе ничего */
export function leadSinkFromEnv(read: (name: string) => string | undefined): LeadSink {
  const token = read("LEADS_TELEGRAM_BOT_TOKEN");
  const chat = read("LEADS_TELEGRAM_CHAT_ID");
  if (token && chat) return telegramLeadSink(token, chat);
  const webhook = read("LEADS_WEBHOOK_URL");
  if (webhook && /^https?:\/\//.test(webhook)) return webhookLeadSink(webhook);
  return noneLeadSink;
}
