import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, LogOut, Moon, PanelsTopLeft, Sun, X } from "lucide-react";
import { ALL_SITES, industryPacks, useApp } from "@/lib/app-context";
import { navGroups, type BadgeKey } from "@/lib/navigation";
import { sites } from "@/mock/sites";
import { events } from "@/mock/events";
import { risks, tasks } from "@/mock/tasks";
import { requests } from "@/mock/supply";
import { cn } from "@/lib/utils";

const DEFAULT_OPEN = ["Обзор", "Поток данных", "Объекты"];
const CRITICAL_BADGES: BadgeKey[] = ["criticalRisks", "overdueTasks"];

function badgeCounts(): Record<BadgeKey, number> {
  return {
    criticalRisks: risks.filter((r) => r.severity === "critical").length,
    inboxUnprocessed: events.filter((e) => e.status === "received" || e.status === "recognizing").length,
    pendingReview: events.filter((e) => e.status === "review" || e.status === "extracted").length,
    overdueTasks: tasks.filter((t) => t.status === "overdue").length,
    requestsNoReply: requests.filter((r) => r.repliesCount === 0 && r.status !== "draft").length,
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
  const { pack, setPack, siteId, setSiteId, theme, toggleTheme, user } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const counts = badgeCounts();
  const [closedGroups, setClosedGroups] = useState<string[]>(() =>
    navGroups.map((g) => g.title).filter((t) => !DEFAULT_OPEN.includes(t)),
  );

  const isItemActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const activeGroup = navGroups.find((g) => g.items.some((i) => isItemActive(i.to)))?.title;

  const packLabel = industryPacks.find((p) => p.id === pack);
  const siteLabel = siteId === ALL_SITES ? "Все объекты" : sites.find((s) => s.id === siteId)?.name;

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 text-sidebar-item">
      <div className="flex items-center gap-2 px-1 py-1.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--r-sm)] bg-ink text-primary-foreground shadow-[var(--shadow-xs)]">
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
          <label
            className="relative block rounded-[var(--r-sm)] bg-surface px-3 py-2 shadow-[var(--shadow-xs)]"
            title={packLabel ? `${packLabel.label} — ${packLabel.hint}` : undefined}
          >
            <span className="block text-overline text-text-muted">Отраслевой пакет</span>
            <select
              value={pack}
              onChange={(e) => setPack(e.target.value as typeof pack)}
              className="focus-ring mt-0.5 h-6 w-full appearance-none overflow-hidden bg-transparent pr-6 text-ellipsis whitespace-nowrap text-sm font-medium text-text-primary"
            >
              {industryPacks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.hint}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 bottom-3 size-4 text-text-muted" />
          </label>
          <label className="relative block rounded-[var(--r-sm)] bg-surface px-3 py-2 shadow-[var(--shadow-xs)]" title={siteLabel}>
            <span className="block text-overline text-text-muted">Объект</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="focus-ring mt-0.5 h-6 w-full appearance-none overflow-hidden bg-transparent pr-6 text-ellipsis whitespace-nowrap text-sm font-medium text-text-primary"
            >
              <option value={ALL_SITES}>Все объекты</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 bottom-3 size-4 text-text-muted" />
          </label>
        </div>
      )}

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
                  className="focus-ring flex w-full items-center gap-1.5 rounded-[var(--r-xs)] px-2 py-1.5 text-overline text-[var(--sidebar-section)] transition-fast hover:text-sidebar-item-hover"
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
                          to={item.to}
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
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-full text-sidebar-item transition-fast hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover"
          >
            {theme === "light" ? <Moon className="size-4 shrink-0" /> : <Sun className="size-4 shrink-0" />}
          </button>
          {!collapsed && (
            <button
              type="button"
              aria-label="Выход"
              className="focus-ring grid size-9 shrink-0 place-items-center rounded-full text-sidebar-item transition-fast hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover"
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
