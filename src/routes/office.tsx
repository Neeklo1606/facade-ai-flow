import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Кабинет компании (ADR-039): отдельная поверхность для управления данными. Свой макет
 * ставит корень по адресу `/office`, здесь только место для разделов.
 */
export const Route = createFileRoute("/office")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Кабинет компании — гайка" }] },
      "Кабинет компании — гайка",
      "Справочники и подключения компании.",
    ),
  component: () => <Outlet />,
});
