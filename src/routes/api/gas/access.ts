import { createFileRoute } from "@tanstack/react-router";
import { gasAccessRequest } from "@/api/gas-access";

/**
 * Приглашения и доступ людей учёта времени (ADR-086): GET — люди и вход, POST — добавить,
 * выдать ссылку на 72 часа, отозвать. Права проверяет обработчик: только администратор
 */
export const Route = createFileRoute("/api/gas/access")({
  server: {
    handlers: {
      GET: async ({ request }) => gasAccessRequest(request),
      POST: async ({ request }) => gasAccessRequest(request),
    },
  },
});
