import type { ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { isLegacyPath, isRetiredPath, legacyModulesEnabled } from "@/lib/legacy-modules";
import { useCurrentRole } from "@/lib/project-scope";
import { homeRouteFor } from "@/lib/navigation";

/**
 * Граница модулей за флагом `legacy_modules` (ADR-034, п. 4 и 5). Адрес модуля вне трёх
 * сценариев и адрес страницы-обещания ведут на корень, а корень — на рабочий экран роли
 * (ADR-028). Экрана «Раздел не найден» здесь нет намеренно: адрес не исчез, модуль просто
 * не входит в ГАЙКУ, и человека возвращают туда, где он работает.
 */
export function LegacyBoundary({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const view = useRouterState({
    select: (state) => String((state.location.search as Record<string, unknown>)["view"] ?? ""),
  });
  const role = useCurrentRole();
  const hidden = !legacyModulesEnabled();
  // Корень теперь сайт (ADR-047): скрытый модуль ведёт на рабочий экран роли, а не на «/»
  if (hidden && (isRetiredPath(pathname) || isLegacyPath(pathname, view))) {
    return <Navigate to={homeRouteFor(role)} replace />;
  }
  return children;
}
