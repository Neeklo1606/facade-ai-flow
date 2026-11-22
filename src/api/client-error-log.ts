import { z } from "zod";
import { withoutSecretParams } from "@/lib/secret-params";

/**
 * Приём ошибок фронтенда (TASK-A5, п. 5): запись в лог хостинга, без внешних сервисов.
 * Ответ всегда 204 — сбор ошибок не должен порождать новые ошибки на экране.
 */
const report = z.object({
  message: z.string().min(1).max(500),
  stack: z.string().max(2000).nullable().optional(),
  url: z.string().max(300),
  userAgent: z.string().max(200),
  at: z.string().max(40),
  context: z.record(z.string().max(100)).optional(),
});

export async function clientErrorResponse(request: Request): Promise<Response> {
  try {
    const parsed = report.safeParse(await request.json());
    if (!parsed.success) {
      console.warn("[client-error] отчёт не прошёл проверку схемы");
    } else {
      const { message, userAgent, at, context, stack } = parsed.data;
      // Отчёт пишет браузер: секреты адреса маскируются и здесь, клиенту не верим на слово
      const url = withoutSecretParams(parsed.data.url);
      // Один префикс на все сообщения: по нему ошибки ищутся в логе хостинга
      console.error(
        `[client-error] ${at} ${url} · ${message} · ${JSON.stringify(context ?? {})} · ${userAgent}` +
          (stack ? `\n${stack}` : ""),
      );
    }
  } catch {
    console.warn("[client-error] тело отчёта не прочиталось");
  }
  return new Response(null, { status: 204 });
}
