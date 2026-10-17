import type { ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { isLegacyPath, isRetiredPath, legacyModulesEnabled } from "@/lib/legacy-modules";

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
  const hidden = !legacyModulesEnabled();
  if (hidden && (isRetiredPath(pathname) || isLegacyPath(pathname, view))) {
    return <Navigate to="/" replace />;
  }
  return children;
}
