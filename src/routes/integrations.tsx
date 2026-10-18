import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Интеграции стали «Подключениями» кабинета компании (ADR-039): заглушка ушла, адрес ведёт туда */
export const Route = createFileRoute("/integrations")({
  component: () => <Navigate to="/office/connections" replace />,
});
