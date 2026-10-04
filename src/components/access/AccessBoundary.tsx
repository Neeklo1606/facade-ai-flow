import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { projectOfPath, sectionOfPath, useAccess } from "@/api/access";
import { queries } from "@/api/queries";
import { ScreenSkeleton } from "@/components/common/ScreenStates";
import { NoAccess } from "@/components/access/NoAccess";
import { useApp } from "@/lib/app-context";
import { useCurrentUser } from "@/lib/project-scope";
import { homeRouteFor } from "@/lib/navigation";

/** Подпись рабочего экрана роли для кнопки «Нет доступа» (ADR-028) */
function homeLabel(to: string) {
  if (to === "/attention") return "К тому, что требует решения";
  if (to === "/today") return "К сегодняшней смене";
  if (to === "/check") return "К очереди проверки";
  if (to === "/projects") return "К реестру объектов";
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
   * Отказ остаётся для прямого перехода в закрытый раздел — там он объясняет, у кого доступ.
   * Корень сюда больше не попадает: раздела прав у него нет, он ведёт на рабочий экран роли
   * (ADR-028), а до этого встречал три роли из пяти стеной «Нет доступа».
   */
  if (!roleDenied && projectId && !access.session) return <ScreenSkeleton kind="summary" />;
  const projectDenied = !roleDenied && !!projectId && !access.canProject(section, projectId);
  if (!roleDenied && !projectDenied) return children;

  const to = homeRouteFor(access.role);
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
