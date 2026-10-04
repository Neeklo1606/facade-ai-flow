import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentRole } from "@/lib/project-scope";
import { homeRouteFor } from "@/lib/navigation";

/**
 * Корень адреса — не экран, а дверь: ведёт на рабочий экран роли (ADR-028, п. 1).
 * Прорабу «Сегодня», ПТО «Проверка», остальным «Внимание»; роли без этих разделов — реестр.
 *
 * Прежний дашборд переехал на `/attention`. Старые ссылки на «/» продолжают работать —
 * это перенаправление, а не ошибка.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "neeklo FieldOps" },
      {
        name: "description",
        content: "Рабочий экран роли: что требует вас сейчас на объектах.",
      },
    ],
  }),
  component: HomeRedirect,
});

function HomeRedirect() {
  const role = useCurrentRole();
  return <Navigate to={homeRouteFor(role)} replace />;
}
