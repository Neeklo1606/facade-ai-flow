import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  FileCheck2,
  HardHat,
  LayoutDashboard,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useCurrentRole, useProjectId } from "@/lib/project-scope";
import { visibleFor, allNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  /** Совпадает с ключом пункта меню: по нему панель узнаёт, видит ли роль раздел */
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  search?: Record<string, string>;
  active: (pathname: string, view: unknown) => boolean;
}

/**
 * Нижняя навигация телефона: дашборд как точка входа (ADR-007), затем приоритет площадки —
 * статус объекта, отчёты, проверка извлечённых позиций. Контакты поставщиков — в «Ещё»:
 * шесть подписей в панели на 375px не читаются.
 */
export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useRouterState({
    select: (s) => String((s.location.search as Record<string, unknown>)["view"] ?? ""),
  });
  const pickSection = useRouterState({
    select: (s) => String((s.location.search as Record<string, unknown>)["section"] ?? ""),
  });
  const { setMobileNavOpen } = useApp();
  const projectId = useProjectId();
  const role = useCurrentRole();
  const section = (name: string) => (p: string) => new RegExp(`^/projects/[^/]+/${name}`).test(p);

  const dashboard: Tab = {
    key: "dashboard",
    label: "Дашборд",
    icon: LayoutDashboard,
    to: "/",
    active: (p) => p === "/",
  };

  const tabs: Tab[] = projectId
    ? [
        dashboard,
        {
          key: "project",
          label: "Объект",
          icon: Building2,
          to: `/projects/${projectId}`,
          active: (p) => /^\/projects\/[^/]+\/?$/.test(p),
        },
        {
          key: "reports",
          label: "Отчёты",
          icon: HardHat,
          to: `/projects/${projectId}/field-reports`,
          active: section("field-reports"),
        },
        {
          key: "review",
          label: "Проверка",
          icon: FileCheck2,
          to: `/projects/${projectId}/documents`,
          active: section("documents"),
        },
      ]
    : [
        dashboard,
        {
          key: "projects",
          label: "Объекты",
          icon: Building2,
          to: "/projects",
          active: (p) => p === "/projects" && !pickSection,
        },
        {
          key: "reports",
          label: "Отчёты",
          icon: HardHat,
          to: "/projects",
          search: { section: "field-reports" },
          active: () => pickSection === "field-reports",
        },
        {
          key: "docs",
          label: "Проверка",
          icon: FileCheck2,
          to: "/projects",
          search: { section: "documents" },
          active: () => pickSection === "documents",
        },
      ];

  // Панель показывает те же разделы, что и сайдбар для этой роли (ADR-008)
  const navKey = (key: string) =>
    key === "project"
      ? "projects"
      : key === "docs"
        ? "documents"
        : key === "review"
          ? "documents"
          : key === "reports"
            ? "field-reports"
            : key;
  const visible = tabs.filter((tab) => {
    const item = allNavItems.find((navItem) => navItem.key === navKey(tab.key));
    return !item || visibleFor(item, role);
  });

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 grid h-[calc(64px+env(safe-area-inset-bottom))] items-center border-t border-line bg-base pb-[env(safe-area-inset-bottom)] md:hidden",
        // Колонок ровно по числу вкладок роли плюс «Ещё»: классы записаны целиком для сборщика
        visible.length >= 4 ? "grid-cols-5" : visible.length === 3 ? "grid-cols-4" : "grid-cols-3",
      )}
    >
      {visible.map((tab) => {
        const active = tab.active(pathname, view);
        return (
          <Link
            key={tab.key}
            data-tour={`nav-${tab.key}`}
            to={tab.to}
            search={tab.search as never}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-fast",
              active ? "font-medium text-orange-hot" : "text-text-3",
            )}
          >
            <tab.icon className="size-5" strokeWidth={1.75} />
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="focus-ring flex h-16 flex-col items-center justify-center gap-1 text-[11px] text-text-3 transition-fast"
      >
        <Menu className="size-5" strokeWidth={1.75} />
        Ещё
      </button>
    </nav>
  );
}
