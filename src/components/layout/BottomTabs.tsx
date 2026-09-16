import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, FileCheck2, HardHat, Menu, Truck, type LucideIcon } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useProjectId } from "@/lib/project-scope";
import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  search?: Record<string, string>;
  active: (pathname: string, view: unknown) => boolean;
}

/**
 * Нижняя навигация телефона. Порядок — по приоритету площадки:
 * статус объекта, отчёты, проверка извлечённых позиций, контакты поставщиков.
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
  const section = (name: string) => (p: string) => new RegExp(`^/projects/[^/]+/${name}`).test(p);

  const tabs: Tab[] = projectId
    ? [
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
        {
          key: "suppliers",
          label: "Поставщики",
          icon: Truck,
          to: `/projects/${projectId}/procurement`,
          search: { view: "suppliers" },
          active: (p, v) => section("procurement")(p) && v === "suppliers",
        },
      ]
    : [
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
        {
          key: "suppliers",
          label: "Поставщики",
          icon: Truck,
          to: "/projects",
          search: { section: "suppliers" },
          active: () => pickSection === "suppliers",
        },
      ];

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_color-mix(in_oklab,var(--bg-page)_45%,transparent)] backdrop-blur-xl lg:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.active(pathname, view);
        return (
          <Link
            key={tab.key}
            to={tab.to}
            search={tab.search as never}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-fast",
              active ? "text-accent" : "text-text-muted",
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
        className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-text-muted transition-fast"
      >
        <Menu className="size-5" strokeWidth={1.75} />
        Ещё
      </button>
    </nav>
  );
}
