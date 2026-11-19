import { createFileRoute } from "@tanstack/react-router";
import { estimateFilesRequest } from "@/api/gas-estimate-files";

/**
 * Папка смет на сервисе (ADR-077): POST — файлы смет, POST `?reparse=` — разобрать заново,
 * GET `?file=` — исходный файл. Права проверяет обработчик
 */
export const Route = createFileRoute("/api/gas/estimate-files")({
  server: {
    handlers: {
      GET: async ({ request }) => estimateFilesRequest(request),
      POST: async ({ request }) => estimateFilesRequest(request),
    },
  },
});
