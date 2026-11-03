import { createFileRoute } from "@tanstack/react-router";
import { gasExportResponse } from "@/api/gas-export";
import { gasServerStore } from "@/api/gas-server-store";
import { sessionActorId } from "@/api/session";

/** Недельный отчёт газового направления файлом (ADR-043): файл собирается на сервере */
export const Route = createFileRoute("/api/gas/export")({
  server: {
    handlers: {
      // Демо присылает данные недели телом; рабочий контур — неделю и версию (ADR-061, 14)
      POST: async ({ request }) =>
        gasExportResponse(request, { store: await gasServerStore(), userId: sessionActorId }),
    },
  },
});
