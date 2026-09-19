import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * «Непонятно на этом экране» (ADR-010): строка JSON с `"channel":"feedback"` в журнал хостинга.
 * Ищется там же, где ошибки фронтенда. Ответ 204; неверный отчёт — 400 без деталей схемы.
 */
const feedback = z.object({
  screen: z.string().max(40),
  screenName: z.string().max(80),
  path: z.string().max(300),
  step: z.string().max(40).nullable(),
  persona: z.string().max(40).nullable().optional(),
  text: z.string().trim().min(1).max(300),
});

export const Route = createFileRoute("/api/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(null, { status: 400 });
        }
        const parsed = feedback.safeParse(body);
        if (!parsed.success) return new Response(null, { status: 400 });
        console.info(
          JSON.stringify({ channel: "feedback", at: new Date().toISOString(), ...parsed.data }),
        );
        return new Response(null, { status: 204 });
      },
    },
  },
});
