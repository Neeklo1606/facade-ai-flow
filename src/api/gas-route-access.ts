/**
 * Вход в файловые маршруты учёта (акты, реестры, запрос цены). В рабочем контуре (есть база)
 * файл собирает только пользователь учёта с живой сессией: иначе адрес — открытый сборщик
 * архивов на сервере для любого, кто его знает. В демонстрации без базы вход не нужен.
 * Правило то же, что у помощника (`assistantAccess`), ответ — 401 или 403 текстом.
 */
import { assistantAccess } from "@/server/gas-assistant";

export async function gasRouteGate(): Promise<Response | null> {
  const [{ gasServerStore }, { sessionActorId }] = await Promise.all([
    import("./gas-server-store"),
    import("./session"),
  ]);
  const access = await assistantAccess(await gasServerStore(), sessionActorId);
  if (access.ok) return null;
  return new Response(access.error, {
    status: access.status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
