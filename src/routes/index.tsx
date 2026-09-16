import { createFileRoute, redirect } from "@tanstack/react-router";

/** Корень ведёт в реестр объектов: сводный дашборд удалён (ADR-003). */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/projects", replace: true });
  },
});
