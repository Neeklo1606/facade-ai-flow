import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Интеграции стали «Подключениями» кабинета компании (ADR-039): заглушка ушла, адрес ведёт туда */
export const Route = createFileRoute("/integrations")({
  head: () => completePageHead({ meta: [] }, "Подключения — гайка", "Статус подключений компании."),
  component: () => <Navigate to="/office/connections" replace />,
});
