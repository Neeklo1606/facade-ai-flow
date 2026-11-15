import { createFileRoute } from "@tanstack/react-router";
import { telegramWebhook } from "@/api/gas-max";

/**
 * Вебхук бота Telegram: второй канал бота бригадира рядом с MAX. Пока нет
 * `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` и базы (`DATABASE_URL`), отвечает 501:
 * событие никто не обработает, и Telegram не должен получить «успех». Адрес подключается
 * методом `setWebhook` с `secret_token` = `TELEGRAM_WEBHOOK_SECRET`.
 */
export const Route = createFileRoute("/api/telegram/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => telegramWebhook(request),
    },
  },
});
