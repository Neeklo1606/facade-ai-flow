import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  UserCog,
} from "lucide-react";
import { navGroupsForRole, type BadgeKey } from "@/lib/navigation";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { useAuth } from "@/lib/auth-context";
import { projects } from "@/mock/projects";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const badgeValues: Record<BadgeKey, number> = {
  overdueTasks: 14,
  pendingReports: 2,
  awaitingSuppliers: 4,
};

function ObjectSelector({ collapsed }: { collapsed: boolean }) {
  const { projectId, setProjectId } = useApp();
  const { account } = useAuth();
  const visible =
    account?.role === "foreman"
      ? projects.filter((p) => account.user.projects.includes(p.id))
      : projects;
  const active = visible.find((p) => p.id === projectId);
  const label = active ? active.shortName : "Все объекты";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-xl border border-[color:var(--sidebar-border)] bg-[color:var(--sidebar-hover-bg)] px-3 py-2 text-left transition-fast hover:bg-[color:var(--bg-subtle)]",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <span className="text-caption font-semibold text-[color:var(--sidebar-active-text)]">
              {active ? active.shortName.slice(0, 2).toUpperCase() : "ВСЕ"}
            </span>
          ) : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-overline text-[color:var(--sidebar-item)]">Объект</span>
                <span className="block truncate text-table font-medium text-[color:var(--sidebar-active-text)]">
                  {label}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-[color:var(--sidebar-item)]" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onSelect={() => setProjectId(ALL_PROJECTS)} className="gap-2">
          <Check className={cn("size-4", projectId !== ALL_PROJECTS && "opacity-0")} />
          <span className="font-medium">Все объекты</span>
        </DropdownMenuItem>
        {visible.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => setProjectId(p.id)} className="gap-2">
            <Check className={cn("size-4 shrink-0", projectId !== p.id && "opacity-0")} />
            <span className="min-w-0">
              <span className="block truncate">{p.name}</span>
              <span className="block truncate text-caption text-text-muted">{p.customer}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme } = useApp();
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const collapsed = sidebarCollapsed;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const groups = navGroupsForRole(account?.role ?? "pm");

  const switchRole = () => {
    onNavigate?.();
    signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="flex h-full flex-col bg-[color:var(--sidebar-bg)] backdrop-blur-xl border-r border-[color:var(--sidebar-border)]">
      <div className={cn("flex items-center gap-2.5 px-4 py-4", collapsed && "justify-center px-0")}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--sidebar-active-bg)] text-caption font-semibold text-[color:var(--sidebar-active-on)]">
          ФР
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-table font-semibold text-[color:var(--sidebar-active-text)]">
              ФАСАД-РП
            </div>
            <div className="truncate text-caption text-[color:var(--sidebar-item)]">
              СК «Фасадные системы»
            </div>
          </div>
        )}
      </div>

      <div className={cn("px-3 pb-3", collapsed && "px-2")}>
        <ObjectSelector collapsed={collapsed} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <div className="px-2 pb-1.5 text-overline text-[color:var(--sidebar-item)]/70">
                {group.title}
              </div>
            )}
            {collapsed && <div className="mx-2 mb-2 border-t border-[color:var(--sidebar-border)]" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
                const badge = item.badge ? badgeValues[item.badge] : 0;
                const link = (
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-2 text-table transition-fast lg:min-h-0 rounded-full",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-[color:var(--sidebar-active-bg)] font-medium text-[color:var(--sidebar-active-on)]"
                        : "text-[color:var(--sidebar-item)] hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-item-hover)]",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && badge > 0 && (
                      <span className="tnum rounded-full bg-[color:var(--sidebar-active-on)] px-1.5 text-[11px] leading-[18px] font-medium text-[color:var(--sidebar-active-bg)]">
                        {badge}
                      </span>
                    )}
                    {collapsed && badge > 0 && (
                      <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-[color:var(--sidebar-active-bar)]" />
                    )}
                  </Link>
                );
                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[color:var(--sidebar-border)] p-3">
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[color:var(--sidebar-hover-bg)] text-caption font-medium text-[color:var(--sidebar-active-text)]">
            {account?.user.initials ?? "—"}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-table text-[color:var(--sidebar-active-text)]">
                {account?.user.name}
              </div>
              <div className="truncate text-caption text-[color:var(--sidebar-item)]">
                {account?.roleLabel} · демо-роль
              </div>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={switchRole}
          className="mt-2 min-h-11 w-full justify-start gap-2 text-[color:var(--sidebar-item)] hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-item-hover)] lg:min-h-9"
        >
          <UserCog className="size-4 shrink-0" />
          {!collapsed && <span className="text-table">Сменить демо-роль</span>}
        </Button>

        <div className={cn("mt-1 flex items-center gap-1", collapsed && "flex-col")}>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="min-h-11 flex-1 justify-start gap-2 text-[color:var(--sidebar-item)] hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-item-hover)] lg:min-h-9"
          >
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            {!collapsed && (
              <span className="text-table">{theme === "light" ? "Темная тема" : "Светлая тема"}</span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Выход"
            onClick={switchRole}
            className="text-[color:var(--sidebar-item)] hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-item-hover)]"
          >
            <LogOut className="size-4" />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="mt-1 hidden w-full justify-start gap-2 text-[color:var(--sidebar-item)] hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-item-hover)] lg:flex"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && <span className="text-table">Свернуть</span>}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed } = useApp();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 lg:block",
        sidebarCollapsed ? "w-16" : "w-[264px]",
      )}
      style={{ transition: "width 140ms ease-out" }}
    >
      <SidebarContent />
    </aside>
  );
}
