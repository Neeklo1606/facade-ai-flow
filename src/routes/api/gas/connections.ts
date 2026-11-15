import { createFileRoute } from "@tanstack/react-router";
import { connectionsResponse } from "@/api/gas-connections-server";

/** Что подключено на сервере (ADR-072): только признаки, без значений ключей */
export const Route = createFileRoute("/api/gas/connections")({
  server: {
    handlers: {
      GET: async () => connectionsResponse(),
    },
  },
});
