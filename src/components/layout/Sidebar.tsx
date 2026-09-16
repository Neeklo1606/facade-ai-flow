import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, LogOut, Moon, PanelsTopLeft, Search, Sun, X } from "lucide-react";
import { ALL_SITES, useApp } from "@/lib/app-context";
import { navGroups, type BadgeKey } from "@/lib/navigation";
import { siteIdOf, useProjectId } from "@/lib/project-scope";
import { projects } from "@/mock/repository";
import { useOverviews } from "@/lib/project-overview";
import { cn } from "@/lib/utils";

const CRITICAL_BADGES: BadgeKey[] = ["overdueRequests"];

/** Разделы, у которых есть экран внутри объекта: при выбранном объекте меню ведёт туда. */
const projectScoped: Record<string, string> = {
  "/documents": "documents",
  "/materials": "materials",
  "/requests": "procurement",
  "/suppliers": "procurement?view=suppliers",
  "/field-reports": "field-reports",
  "/audit": "timeline",
};

function badgeCounts(
  projectId: string | null,
  overviews: ReturnType<typeof useOverviews>,
): Record<BadgeKey, number> {
  const scoped = overviews.filter(
    (item): item is NonNullable<typeof item> => !!item && (projectId ? item.projectId === projectId : true),
  );
  const total = (pick: (item: (typeof scoped)[number]) => number) => scoped.reduce((acc, item) => acc + pick(item), 0);
  return {
    unverifiedSpec: total((item) => item.specUnverified),
    overdueRequests: total((item) => item.overdueRequests),
    openChanges: total((item) => item.openChanges),
  };
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useApp();

  return (
    <>
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-40 bg-[color:color-mix(in_oklab,var(--ink)_32%,transparent)] backdrop-blur-[4px] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] transition-[width,transform] duration-150 ease-out lg:relative lg:inset-auto lg:h-full lg:translate-x-0",
          sidebarCollapsed ? "lg:w-[72px]" : "lg:w-[260px]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarInner collapsed={sidebarCollapsed} onToggle={toggleSidebar} onClose={() => setMobileNavOpen(false)} />
      </aside>
    </>
  );
}

function SidebarInner({
  collapsed,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { siteId, setSiteId, theme, toggleTheme, user, setCommandOpen } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useRouterState({ select: (s) => String((s.location.search as Record<string, unknown>)["view"] ?? "") });
  const projectId = useProjectId();
  const overviews = useOverviews(projects.map((p) => p.id));
  const counts = badgeCounts(projectId, overviews);
  const navigate = useNavigate();
  /** Смена объекта на экране объекта открывает тот же раздел у выбранного объекта. */
  const changeProject = (value: string) => {
    setSiteId(value);
    const match = pathname.match(/^\/projects\/[^/]+(\/(documents|materials|procurement|field-reports|timeline))?/);
    if (!match) return;
    if (value === ALL_SITES) {
      navigate({ to: "/projects" });
      return;
    }
    const id = value.replace(/^s-/, "p-");
    navigate({ to: `/projects/${id}${match[1] ?? ""}` });
  };
  const hrefOf = (to: string) => {
    const scoped = projectId ? projectScoped[to] : undefined;
    if (!scoped) return { to, search: undefined };
    const [section, query] = scoped.split("?");
    return {
      to: `/projects/${projectId}/${section}`,
      search: query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
    };
  };
  const [closedGroups, setClosedGroups] = useState<string[]>([]);

  const isItemActive = (to: string) => {
    if (to === "/") return pathname === "/";
    const section = projectScoped[to]?.split("?")[0];
    const inProject = pathname.match(/^\/projects\/[^/]+\/([^/?]+)/)?.[1];
    if (section && inProject) {
      if (section !== inProject) return false;
      // Запросы и поставщики — один экран: подсвечиваем пункт по выбранному виду
      if (section === "procurement") return (to === "/suppliers") === (view === "suppliers");
      return true;
    }
    if (to === "/projects") return pathname === "/projects" || /^\/projects\/[^/]+\/?$/.test(pathname);
    return pathname.startsWith(to);
  };
  const activeGroup = navGroups.find((g) => g.items.some((i) => isItemActive(i.to)))?.title;

  const siteLabel = projectId ? projects.find((p) => p.id === projectId)?.name : "Все объекты";

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 text-sidebar-item">
      <div className="flex items-center gap-2 px-1 py-1.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--r-sm)] bg-accent text-accent-foreground shadow-[var(--shadow-xs)]">
          <PanelsTopLeft className="size-[18px]" strokeWidth={1.5} />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm leading-tight font-semibold text-sidebar-active-text">neeklo FieldOps</div>
            <div className="truncate text-[11px] text-text-muted">СК «Фасад-Проект»</div>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть меню"
          className="focus-ring grid size-11 place-items-center rounded-full text-sidebar-item hover:bg-hover hover:text-sidebar-item-hover lg:hidden"
        >
          <X className="size-5" />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-3 shrink-0 space-y-2">
          <label className="relative block rounded-[var(--r-sm)] bg-surface px-3 py-2 shadow-[var(--shadow-xs)]" title={siteLabel}>
            <span className="block text-overline text-text-muted">Объект</span>
            <select
              value={siteId}
              onChange={(e) => changeProject(e.target.value)}
              className="focus-ring mt-0.5 h-6 w-full appearance-none overflow-hidden bg-transparent pr-6 text-ellipsis whitespace-nowrap text-sm font-medium text-text-primary"
            >
              <option value={ALL_SITES}>Все объекты</option>
              {projects.map((p) => (
                <option key={p.id} value={siteIdOf(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 bottom-3 size-4 text-text-muted" />
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          onClose();
          setCommandOpen(true);
        }}
        title="Поиск"
        aria-label="Поиск по объектам, документам и материалам"
        className={cn(
          "focus-ring mt-2 flex h-[38px] shrink-0 items-center gap-2 rounded-[var(--r-sm)] border border-[var(--sidebar-hover-bg)] px-2.5 text-[13px] text-sidebar-item transition-fast hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover",
          collapsed && "justify-center px-0",
        )}
      >
        <Search className="size-4 shrink-0" strokeWidth={1.5} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">Поиск</span>
            <kbd className="shrink-0 rounded-[var(--r-xs)] bg-[var(--sidebar-hover-bg)] px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
          </>
        )}
      </button>

      <nav className="nav-scroll mt-2 min-h-0 flex-1 py-1">
        {navGroups.map((group) => {
          const open = collapsed || !closedGroups.includes(group.title) || group.title === activeGroup;
          const hiddenCritical = group.items.reduce(
            (sum, i) => sum + (i.badge && CRITICAL_BADGES.includes(i.badge) ? counts[i.badge] : 0),
            0,
          );
          return (
            <div key={group.title} className="mb-1 pt-2">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() =>
                    setClosedGroups((prev) =>
                      prev.includes(group.title) ? prev.filter((t) => t !== group.title) : [...prev, group.title],
                    )
                  }
                  aria-expanded={open}
                  className="focus-ring flex min-h-11 w-full items-center gap-1.5 rounded-[var(--r-xs)] px-2 py-1.5 text-overline lg:min-h-0 text-[var(--sidebar-section)] transition-fast hover:text-sidebar-item-hover"
                >
                  <ChevronRight
                    className={cn("size-3.5 shrink-0 transition-transform duration-150", open && "rotate-90")}
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 flex-1 truncate text-left">{group.title}</span>
                  {!open && hiddenCritical > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger-bg px-1.5 text-[11px] font-semibold tnum text-danger">
                      {hiddenCritical}
                    </span>
                  )}
                </button>
              )}
              {open && (
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const active = isItemActive(item.to);
                    const count = item.badge ? counts[item.badge] : 0;
                    return (
                      <li key={item.to}>
                        <Link
                          to={hrefOf(item.to).to}
                          search={hrefOf(item.to).search as never}
                          onClick={onClose}
                          title={item.label}
                          className={cn(
                            "focus-ring flex h-11 items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 text-sm font-medium transition-fast lg:h-[38px]",
                            active
                              ? "bg-sidebar-active-bg text-sidebar-active-text shadow-[var(--shadow-xs)] [&>svg]:text-sidebar-active-bar"
                              : "text-sidebar-item hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover",
                          )}
                        >
                          <item.icon className="size-[18px] shrink-0" strokeWidth={1.5} />
                          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                          {!collapsed && count > 0 && (
                            <span
                              className={cn(
                                "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tnum",
                                item.badge && CRITICAL_BADGES.includes(item.badge)
                                  ? "bg-danger-bg text-danger"
                                  : "bg-hover text-text-secondary",
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border pt-3">
        <div className="flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 hover:bg-[var(--sidebar-hover-bg)]">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pastel-violet text-[11px] font-medium text-pastel-violet-fg">
            СИ
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-sidebar-active-text" title={user?.name}>
                {user?.name}
              </div>
              <div className="truncate text-[11px] text-text-muted">{user?.roleLabel}</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Переключить тему"
            title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
            className="focus-ring hidden size-9 shrink-0 place-items-center rounded-full text-sidebar-item transition-fast hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover lg:grid [@media(hover:none)]:hover:bg-transparent"
          >
            {theme === "light" ? <Moon className="size-4 shrink-0" /> : <Sun className="size-4 shrink-0" />}
          </button>
          {!collapsed && (
            <button
              type="button"
              aria-label="Выход"
              className="focus-ring grid size-9 shrink-0 place-items-center rounded-full text-sidebar-item transition-fast hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover [@media(hover:none)]:hover:bg-transparent"
            >
              <LogOut className="size-4 shrink-0" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="focus-ring mt-1 hidden h-8 w-full items-center justify-center gap-1.5 rounded-[var(--r-sm)] text-[11px] text-sidebar-item hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover lg:flex"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && "Свернуть меню"}
        </button>
      </div>
    </div>
  );
}
