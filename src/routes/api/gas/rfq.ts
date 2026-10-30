import { createFileRoute } from "@tanstack/react-router";
import { gasRfqResponse } from "@/api/gas-rfq";

/** Файл запроса цены по заявке снабжения (ADR-057): собирается на сервере */
export const Route = createFileRoute("/api/gas/rfq")({
  server: { handlers: { POST: ({ request }) => gasRfqResponse(request) } },
});
