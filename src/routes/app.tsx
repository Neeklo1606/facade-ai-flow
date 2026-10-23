import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentRole } from "@/lib/project-scope";
import { homeRouteFor } from "@/lib/navigation";
import { completePageHead } from "@/lib/page-head";

/**
 * Дверь в полевое приложение (ADR-047): рабочий экран роли. Этим раньше был корень `/`,
 * теперь там сайт. Ссылки приложения «на главную» ведут сюда.
 */
export const Route = createFileRoute("/app")({
  head: () =>
    completePageHead(
      { meta: [{ title: "гайка — рабочий экран" }] },
      "гайка — рабочий экран",
      "Рабочий экран роли в полевом приложении.",
    ),
  component: AppDoor,
});

function AppDoor() {
  const role = useCurrentRole();
  return <Navigate to={homeRouteFor(role)} replace />;
}
