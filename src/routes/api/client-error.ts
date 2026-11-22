import { createFileRoute } from "@tanstack/react-router";
import { clientErrorResponse } from "@/api/client-error-log";

/** Приём ошибок фронтенда в лог хостинга (TASK-A5, п. 5). Обработчик — src/api/client-error-log.ts */
export const Route = createFileRoute("/api/client-error")({
  server: {
    handlers: {
      POST: async ({ request }) => clientErrorResponse(request),
    },
  },
});
