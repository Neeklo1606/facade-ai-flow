import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, LogOut, Moon, PanelsTopLeft, Sun, X } from "lucide-react";
import { ALL_SITES, industryPacks, useApp } from "@/lib/app-context";
import { navGroups, type BadgeKey } from "@/lib/navigation";
import { sites } from "@/mock/sites";
import { events } from "@/mock/events";
import { risks, tasks } from "@/mock/tasks";
import { requests } from "@/mock/supply";
import { cn } from "@/lib/utils";

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
          className="fixed inset-0 z-40 bg-[#1a2228]/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col bg-sidebar-bg transition-[width,transform] duration-150 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          sidebarCollapsed ? "lg:w-16" : "lg:w-[264px]",
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

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sidebar-item">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-3">
        <PanelsTopLeft className="size-5 shrink-0 text-sidebar-active-bar" strokeWidth={2} />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] leading-tight font-semibold text-sidebar-item-hover">neeklo FieldOps</div>
            <div className="truncate text-[11px] text-sidebar-item">СК «Фасад-Проект»</div>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть меню"
          className="grid size-11 place-items-center text-sidebar-item transition-fast hover:text-sidebar-item-hover lg:hidden"
        >
          <X className="size-5" />
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-2 border-b border-sidebar-border px-3 py-3">
          <label className="block">
            <span className="text-[11px] tracking-[0.1em] text-sidebar-item uppercase">Отраслевой пакет</span>
            <select
              value={pack}
              onChange={(e) => setPack(e.target.value as typeof pack)}
              className="mt-1 h-9 w-full rounded-md border border-sidebar-border bg-[rgba(255,255,255,0.06)] px-2 text-[13px] text-sidebar-item-hover outline-none focus:border-sidebar-active-bar"
            >
              {industryPacks.map((p) => (
                <option key={p.id} value={p.id} className="text-text-primary">
                  {p.label} — {p.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] tracking-[0.1em] text-sidebar-item uppercase">Объект</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-sidebar-border bg-[rgba(255,255,255,0.06)] px-2 text-[13px] text-sidebar-item-hover outline-none focus:border-sidebar-active-bar"
            >
              <option value={ALL_SITES} className="text-text-primary">
                Все объекты
              </option>
              {sites.map((s) => (
                <option key={s.id} value={s.id} className="text-text-primary">
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-3">
            {!collapsed && (
              <div className="px-2 pb-1 text-[11px] tracking-[0.1em] text-sidebar-item/70 uppercase">{group.title}</div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                const count = item.badge ? counts[item.badge] : 0;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onClose}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "relative flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-fast lg:min-h-0",
                        active
                          ? "bg-sidebar-active-bg text-sidebar-active-text"
                          : "text-sidebar-item hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover",
                      )}
                    >
                      {active && (
                        <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-sm bg-sidebar-active-bar" />
                      )}
                      <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {!collapsed && count > 0 && (
                        <span
                          className={cn(
                            "rounded-sm px-1.5 py-0.5 text-[11px] font-medium tnum",
                            item.badge === "criticalRisks" || item.badge === "overdueTasks"
                              ? "bg-danger text-white"
                              : "bg-[rgba(255,255,255,0.12)] text-sidebar-item-hover",
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
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[rgba(255,255,255,0.1)] text-[11px] font-medium text-sidebar-item-hover">
            СИ
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-sidebar-item-hover">{user?.name}</div>
              <div className="truncate text-[11px] text-sidebar-item">{user?.roleLabel}</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Переключить тему"
            className="grid size-8 place-items-center rounded-md text-sidebar-item transition-fast hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover"
          >
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
          {!collapsed && (
            <button
              type="button"
              aria-label="Выход"
              className="grid size-8 place-items-center rounded-md text-sidebar-item transition-fast hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 hidden w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] text-sidebar-item transition-fast hover:bg-[var(--sidebar-hover-bg)] hover:text-sidebar-item-hover lg:flex"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && "Свернуть меню"}
        </button>
      </div>
    </div>
  );
}
