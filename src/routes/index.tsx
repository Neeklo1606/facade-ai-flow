import { createFileRoute, Navigate } from "@tanstack/react-router";
import { demoShow } from "@/api/config";
import { isEntering, useRoleChosen } from "@/lib/guide/store";
import { useCurrentRole } from "@/lib/project-scope";
import { homeRouteFor } from "@/lib/navigation";

/**
 * Корень адреса (ADR-028, п. 1; ADR-038). В рабочем контуре — дверь на рабочий экран роли.
 * Демо-контур без выбранной роли — экран входа показа, и он приходит уже в первом HTML:
 * клиент видит заголовок и плитки сценариев до загрузки скриптов (D5, Lighthouse).
 *
 * Прежний дашборд переехал на `/attention`. Старые ссылки на «/» продолжают работать —
 * это перенаправление, а не ошибка.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "гайка — говорите с объекта" },
      {
        name: "description",
        content:
          "Говорите с объекта. Голос с площадки становится отчётом, документом и заявкой, а человек только подтверждает.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const chosen = useRoleChosen();
  const role = useCurrentRole();
  /*
   * Роль выбрана на экране входа прямо сейчас — переход делает сам экран входа (плитка ведёт
   * на шаг сценария). Перенаправлять здесь можно, только если роль была выбрана до захода:
   * иначе корень перебивал бы плитку и уводил на рабочий экран.
   */
  if (!demoShow || (chosen === true && !isEntering())) {
    return <Navigate to={homeRouteFor(role)} replace />;
  }
  return null;
}
