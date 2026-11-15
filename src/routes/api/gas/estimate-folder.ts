import { createFileRoute } from "@tanstack/react-router";
import { estimateFolderRequest } from "@/api/gas-estimate-folder";

/**
 * Папка смет на Яндекс Диске (ADR-072): GET — список файлов, GET `?path=` — файл.
 * Токен Диска только в окружении сервера
 */
export const Route = createFileRoute("/api/gas/estimate-folder")({
  server: {
    handlers: {
      GET: async ({ request }) => estimateFolderRequest(request),
    },
  },
});
