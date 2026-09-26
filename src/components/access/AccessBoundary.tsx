import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { projectOfPath, sectionOfPath, useAccess } from "@/api/access";
import { queries } from "@/api/queries";
import { ScreenSkeleton } from "@/components/common/ScreenStates";
import { NoAccess } from "@/components/access/NoAccess";
import { useApp } from "@/lib/app-context";
import { useCurrentUser } from "@/lib/project-scope";
import { startRouteFor } from "@/lib/navigation";

/** Подпись стартового экрана роли для кнопки «Нет доступа» */
function homeLabel(to: string) {
  if (to === "/") return "На дашборд";
  if (to === "/projects") return "К реестру объектов";
  if (to.endsWith("/procurement")) return "В закупки";
  if (to.endsWith("/field-reports")) return "К отчётам с площадки";
  if (to.endsWith("/documents")) return "В документацию";
  return "К объекту";
}

/**
 * Граница прав вокруг экранов (ADR-012, п. 6). Раздел по адресу закрыт роли — вместо экрана
 * «Нет доступа». Объект не из своих у роли со «своими объектами» — то же. Пока роль неизвестна,
 * экран не рисуется: иначе на мгновение мелькнул бы чужой раздел.
 */
export function AccessBoundary({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useRouterState({
    select: (s) => String((s.location.search as Record<string, unknown>)["view"] ?? ""),
  });
  const access = useAccess();
  const user = useCurrentUser();
  const { personaSwitching } = useApp();
  const projects = useQuery({ ...queries.projects(), enabled: access.ready }).data;
  const section = sectionOfPath(pathname, view);
  if (personaSwitching) return <ScreenSkeleton kind="summary" />;
  if (!section) return children;
  if (!access.ready || !user || !access.role) return <ScreenSkeleton kind="summary" />;

  const projectId = projectOfPath(pathname);
  const roleDenied = !access.can(section);

  /*
   * Корень адреса — рабочий экран роли, а не стена. ПТО, снабжение и прораб, открыв «/»,
   * упирались в «Нет доступа» с заголовком вкладки «Дашборд»: для трёх ролей из пяти продукт
   * начинался с отказа (находка аудита соответствия). Отказ остаётся для прямого перехода
   * в закрытый раздел — там он объясняет, у кого доступ.
   */
  if (roleDenied && pathname === "/") {
    const home = startRouteFor(access.role, projects?.[0]?.project.id ?? null);
    if (home !== "/") return <Navigate to={home} replace />;
  }
  if (!roleDenied && projectId && !access.session) return <ScreenSkeleton kind="summary" />;
  const projectDenied = !roleDenied && !!projectId && !access.canProject(section, projectId);
  if (!roleDenied && !projectDenied) return children;

  const to = startRouteFor(access.role, projects?.[0]?.project.id ?? null);
  return (
    <NoAccess
      section={section}
      reason={roleDenied ? "role" : "project"}
      userName={user.name}
      roleLabel={user.roleLabel}
      home={{ to, label: homeLabel(to) }}
    />
  );
}
