import { createFileRoute } from "@tanstack/react-router";
import { gasRouteGate } from "@/api/gas-route-access";
import { gasRfqResponse } from "@/api/gas-rfq";

/** Файл запроса цены по заявке снабжения (ADR-057): собирается на сервере */
export const Route = createFileRoute("/api/gas/rfq")({
  server: {
    handlers: { POST: async ({ request }) => (await gasRouteGate()) ?? gasRfqResponse(request) },
  },
});
