import { createFileRoute } from "@tanstack/react-router";
import { connectionsResponse } from "@/api/office";

/** Статус подключений кабинета компании: только состояние, ключей нет (ADR-039) */
export const Route = createFileRoute("/api/office/connections")({
  server: { handlers: { GET: () => connectionsResponse() } },
});
