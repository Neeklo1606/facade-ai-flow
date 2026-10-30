import { createFileRoute } from "@tanstack/react-router";
import { gasExecDocsResponse } from "@/api/gas-exec-docs";

/** Файлы исполнительной документации (ADR-058): акт docx, реестр xlsx, пакет zip */
export const Route = createFileRoute("/api/gas/exec-docs")({
  server: { handlers: { POST: ({ request }) => gasExecDocsResponse(request) } },
});
