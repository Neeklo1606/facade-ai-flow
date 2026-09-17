import { createFileRoute } from "@tanstack/react-router";
import { registryExportResponse } from "@/api/exports";

/** Выгрузка реестра объектов в Excel на сервере (P3-5). Интерфейс скачивает файл по этому адресу. */
export const Route = createFileRoute("/api/export/projects")({
  server: {
    handlers: {
      GET: ({ request }) => registryExportResponse(request),
    },
  },
});
