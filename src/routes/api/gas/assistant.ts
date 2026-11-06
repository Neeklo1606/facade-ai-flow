import { createFileRoute } from "@tanstack/react-router";
import {
  allowRequest,
  askClaude,
  assistantConfigured,
  parseAssistantBody,
} from "@/server/gas-assistant";

/**
 * Агент учёта времени (ADR-066): GET — подключена ли модель, POST — вопрос с данными недели.
 * Ключ и модель только на сервере; ответ без записи в данные: модель ничего не меняет
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/gas/assistant")({
  server: {
    handlers: {
      GET: async () => json(assistantConfigured()),
      POST: async ({ request }) => {
        if (!assistantConfigured().available) {
          return json({ error: "Агент не подключён: на сервере нет ключа модели" }, 503);
        }
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "local";
        if (!allowRequest(ip))
          return json({ error: "Слишком много вопросов, подождите минуту" }, 429);
        const parsed = parseAssistantBody(await request.json().catch(() => null));
        if (!parsed.ok) return json({ error: parsed.reason }, 400);
        try {
          return json(await askClaude(parsed));
        } catch {
          // Подробность ошибки провайдера в ответ не отдаём: в ней бывают части запроса
          return json({ error: "Агент не ответил, повторите" }, 502);
        }
      },
    },
  },
});
