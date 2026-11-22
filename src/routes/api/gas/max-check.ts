import { createFileRoute } from "@tanstack/react-router";
import { maxCheckRequest } from "@/api/gas-max-check";

/**
 * Проверка канала MAX из «Подключений» (ADR-085): вебхук и тестовое сообщение себе.
 * Только администратор, токен только в окружении сервера
 */
export const Route = createFileRoute("/api/gas/max-check")({
  server: {
    handlers: {
      POST: async ({ request }) => maxCheckRequest(request),
    },
  },
});
