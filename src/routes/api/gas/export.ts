import { createFileRoute } from "@tanstack/react-router";
import { gasExportResponse } from "@/api/gas-export";

/** Недельный отчёт газового направления файлом (ADR-043): файл собирается на сервере */
export const Route = createFileRoute("/api/gas/export")({
  server: { handlers: { POST: ({ request }) => gasExportResponse(request) } },
});
