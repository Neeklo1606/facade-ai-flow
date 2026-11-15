/**
 * Ответ `/api/gas/connections` (ADR-072): признаки подключений из окружения сервера.
 * Значения ключей не уходят никогда — только «задано», имя папки и модели.
 */
import { normalizeFolder } from "@/adapters/gas-ops/yandex-disk";
import { connectionsOf } from "@/domain/gas-ops/connections";
import { assistantConfigured } from "@/server/gas-assistant";

export function connectionsResponse(): Response {
  const body = connectionsOf(
    process.env,
    assistantConfigured(),
    normalizeFolder(process.env["YANDEX_DISK_FOLDER"]),
  );
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
