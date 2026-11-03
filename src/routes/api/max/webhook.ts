import { createFileRoute } from "@tanstack/react-router";
import { maxWebhook } from "@/api/gas-max";

/**
 * Вебхук бота MAX (ADR-061, 14). Пока нет `MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET` и хранилища
 * диалогов над базой (B6), отвечает 501: событие никто не обработает, и MAX не должен
 * получить «успех». Обработчик и правила готовы: `handleInbound` в src/api/gas-max.ts.
 */
export const Route = createFileRoute("/api/max/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => maxWebhook(request),
    },
  },
});
