import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Кабинет компании (ADR-039): отдельная поверхность для управления данными. Свой макет
 * ставит корень по адресу `/office`, здесь только место для разделов.
 */
export const Route = createFileRoute("/office")({
  head: () => ({ meta: [{ title: "Кабинет компании — гайка" }] }),
  component: () => <Outlet />,
});
