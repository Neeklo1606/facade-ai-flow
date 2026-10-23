import { createFileRoute } from "@tanstack/react-router";
import { leadResponse } from "@/api/leads";

/** Заявка с сайта (ADR-051): порт LeadSink, адаптер по окружению хостинга */
export const Route = createFileRoute("/api/leads")({
  server: { handlers: { POST: ({ request }) => leadResponse(request) } },
});
