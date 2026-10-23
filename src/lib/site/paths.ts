/**
 * Адреса публичного сайта (ADR-047): своя оболочка без меню приложения, отрисовка на сервере.
 * Модуль крошечный: его читает корень приложения на каждом экране.
 */
import { demoShow } from "@/api/config";

export const SITE_PATHS = ["/", "/demo", "/case/gas", "/razbor", "/kit", "/privacy"] as const;

/** В рабочем контуре (`VITE_DATA_SOURCE=server`) сайта нет: корень ведёт на экран роли */
export function isSitePath(pathname: string): boolean {
  if (!demoShow) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  // /og/<имя>: страницы для снимков превью, только в разработке (ADR-051)
  return (SITE_PATHS as readonly string[]).includes(path) || path.startsWith("/og/");
}
