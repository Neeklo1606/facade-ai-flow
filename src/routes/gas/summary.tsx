import { createFileRoute, redirect } from "@tanstack/react-router";

/** Сводка переехала в «Обзор» (ADR-052): старые ссылки ведут туда же */
export const Route = createFileRoute("/gas/summary")({
  beforeLoad: () => {
    throw redirect({ to: "/gas/overview", replace: true });
  },
});
