import { createFileRoute } from "@tanstack/react-router";
import { shiftExportResponse } from "@/api/exports";

/** Сводка смены и черновик ведомости файлом (ADR-037): файл собирается на сервере */
export const Route = createFileRoute("/api/export/shift")({
  server: { handlers: { GET: ({ request }) => shiftExportResponse(request) } },
});
