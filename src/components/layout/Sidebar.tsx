import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  PanelsTopLeft,
  RotateCcw,
  X,
} from "lucide-react";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { activeNavKey, navGroupsFor, sectionHref, type BadgeKey } from "@/lib/navigation";
import { useCurrentUser, useProjectId } from "@/lib/project-scope";
import { useEnterAs } from "@/lib/persona";
import { useResetDemo } from "@/api/mutations";
import { dataSource, DEMO_PERSONAS } from "@/api/config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { employeeRoleLabel, type EmployeeRole, type ProjectOverview } from "@/contracts";
import { cn } from "@/lib/utils";

const CRITICAL_BADGES: BadgeKey[] = ["overdueRequests"];

function badgeCounts(
  projectId: string | null,
  overviews: ProjectOverview[],
): Record<BadgeKey, number> {
  const scoped = overviews.filter((item) => (projectId ? item.projectId === projectId : true));
  const total = (pick: (item: (typeof scoped)[number]) => number) =>
    scoped.reduce((acc, item) => acc + pick(item), 0);
  return {
    unverifiedSpec: total((item) => item.specUnverified),
    overdueRequests: total((item) => item.overdueRequests),
    openChanges: total((item) => item.openChanges),
    deliveriesToAccept: total((item) => item.deliveriesToAccept),
  };
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useApp();
  // 1440 и шире — полный сайдбар (или свёрнутый по выбору), 1024–1439 — всегда 72px,
  // ниже 1024 — выдвижное меню, в нём сайдбар всегда полный
  const wide = useMediaQuery("(min-width: 1440px)");
  const desktop = useMediaQuery("(min-width: 1024px)");
  const collapsed = desktop && (sidebarCollapsed || !wide);

  return (
    <>
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[4px] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        aria-label="Главное меню"
        data-sidebar="app"
        className={cn(
          // На телефоне меню выезжает поверх экрана и нуждается в фоне; в оболочке сайдбар прозрачный
          "fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-w)] shrink-0 flex-col bg-base transition-[width,transform,visibility] duration-150 ease-out lg:relative lg:inset-auto lg:h-full lg:translate-x-0 lg:bg-transparent",
          collapsed ? "lg:w-[72px]" : "lg:w-[var(--sidebar-w)]",
          // Закрытое выдвижное меню скрыто от фокуса и диктора; скрытие ждёт конца выезда (ADR-015, п. 3)
          mobileNavOpen ? "translate-x-0" : "-translate-x-full max-lg:invisible",
        )}
      >
        <SidebarInner
          collapsed={collapsed}
          canToggle={wide}
          onToggle={toggleSidebar}
          onClose={() => setMobileNavOpen(false)}
        />
      </aside>
    </>
  );
}

function SidebarInner({
  collapsed,
  canToggle,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  /** Сворачивать вручную можно только с 1440px: уже — сайдбар свёрнут всегда */
  canToggle: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { setProjectId, personaId } = useApp();
  const enterAs = useEnterAs();
  const user = useCurrentUser();
  // Меню зависит от роли выбранной персоны (ADR-008): снабжение не ведёт площадку,
  // прораб не занимается закупками
  const groups = navGroupsFor(user?.role ?? "manager");
  const resetDemo = useResetDemo();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useRouterState({
    select: (s) => String((s.location.search as Record<string, unknown>)["view"] ?? ""),
  });
  const pickSection = useRouterState({
    select: (s) => {
      const value = (s.location.search as Record<string, unknown>)["section"];
      return typeof value === "string" ? value : null;
    },
  });
  const projectId = useProjectId();
  const { data: registry = [] } = useQuery(queries.projects());
  const projects = registry.map((item) => item.project);
  const overviews = registry.map((item) => item.overview);
  const counts = badgeCounts(projectId, overviews);
  const navigate = useNavigate();
  /** Смена объекта на экране объекта открывает тот же раздел у выбранного объекта. */
  const changeProject = (value: string) => {
    setProjectId(value);
    const match = pathname.match(
      /^\/projects\/[^/]+(\/(documents|materials|procurement|deliveries|field-reports|timeline))?/,
    );
    if (!match) return;
    if (value === ALL_PROJECTS) {
      navigate({ to: "/projects" });
      return;
    }
    navigate({ to: `/projects/${value}${match[1] ?? ""}` });
  };
  const employees = useQuery(queries.employees()).data ?? [];
  const personas = DEMO_PERSONAS.map((id) => employees.find((item) => item.id === id)).filter(
    (item): item is (typeof employees)[number] => !!item,
  );
  /** Смена персоны открывает стартовый экран её роли: иначе можно остаться на скрытом разделе */
  const switchPersona = (id: string, role: EmployeeRole) => {
    onClose();
    void enterAs(id, role).then((to) => navigate({ to }));
  };
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const activeKey = activeNavKey(pathname, view, pickSection);
  // У руководителя и директора меню длиннее экрана ноутбука: активный пункт внизу списка
  // (например, «Права доступа») прокручивается в видимую часть
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);
  const activeGroup = groups.find((g) => g.items.some((i) => i.key === activeKey))?.title;
  // Переход в раздел раскрывает его группу; свернуть можно любую группу, и текущую тоже —
  // иначе её заголовок был бы кнопкой без действия (ADR-015, п. 2)
  useEffect(() => {
    if (activeGroup) setClosedGroups((prev) => prev.filter((title) => title !== activeGroup));
  }, [activeGroup]);

  const siteLabel = projectId ? projects.find((p) => p.id === projectId)?.name : "Все объекты";
  const initials = user?.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      {/* Шапка сайдбара, 60px */}
      <div className={cn("sidebar-header", collapsed && "lg:justify-center lg:px-0")}>
        {collapsed && canToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Развернуть меню"
            title="Развернуть меню"
            className="focus-ring hidden size-[30px] place-items-center rounded-[var(--r-xs)] bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text lg:grid"
          >
            <ChevronsRight className="size-4" strokeWidth={1.5} />
          </button>
        ) : null}
        <span
          className={cn(
            "grid size-[26px] shrink-0 place-items-center rounded-[var(--r-xs)] bg-orange text-on-orange shadow-[var(--glow-orange)]",
            collapsed && canToggle && "lg:hidden",
          )}
        >
          <PanelsTopLeft className="size-[15px]" strokeWidth={1.5} />
        </span>
        <div className={cn("flex min-w-0 flex-1 items-center gap-1.5", collapsed && "lg:hidden")}>
          <span className="truncate text-[15px] leading-tight font-semibold text-text">
            neeklo FieldOps
          </span>
          <ChevronDown className="size-4 shrink-0 text-text-3" strokeWidth={1.5} />
        </div>
        {!collapsed && canToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Свернуть меню"
            title="Свернуть меню"
            className="focus-ring hidden size-[30px] shrink-0 place-items-center rounded-[var(--r-xs)] text-text-3 hover:bg-surface-2 hover:text-text lg:grid"
          >
            <ChevronsLeft className="size-4" strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть меню"
          className="focus-ring grid size-11 shrink-0 place-items-center rounded-full text-text-3 hover:bg-surface-2 hover:text-text lg:hidden"
        >
          <X className="size-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Селектор объекта */}
      {!collapsed && (
        <label className="scope-card mt-1 mb-4 shrink-0" title={siteLabel}>
          <span className="block text-[11px] leading-tight text-text-3">Объект</span>
          <select
            value={projectId ?? ALL_PROJECTS}
            onChange={(e) => changeProject(e.target.value)}
            className="focus-ring mt-1 h-5 w-full cursor-pointer appearance-none overflow-hidden bg-transparent text-ellipsis whitespace-nowrap text-sm leading-5 font-medium text-text"
          >
            <option value={ALL_PROJECTS}>Все объекты</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-3"
            strokeWidth={1.5}
          />
        </label>
      )}

      <nav ref={navRef} className="nav-scroll -mx-1 min-h-0 flex-1 px-1">
        {groups.map((group, index) => {
          const open = collapsed || !closedGroups.includes(group.title);
          const hiddenCritical = group.items.reduce(
            (sum, i) => sum + (i.badge && CRITICAL_BADGES.includes(i.badge) ? counts[i.badge] : 0),
            0,
          );
          return (
            <div key={group.title}>
              {collapsed ? (
                index > 0 && <div className="mx-3 my-3 h-px bg-line" />
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setClosedGroups((prev) =>
                      prev.includes(group.title)
                        ? prev.filter((t) => t !== group.title)
                        : [...prev, group.title],
                    )
                  }
                  aria-expanded={open}
                  className={cn(
                    "nav-group-label focus-ring group rounded-[var(--r-xs)]",
                    index === 0 && "pt-1",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{group.title}</span>
                  {!open && hiddenCritical > 0 && (
                    <span className="nav-badge nav-badge-critical">{hiddenCritical}</span>
                  )}
                  <ChevronDown
                    className={cn(
                      "size-3.5 shrink-0 text-text-4 opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
                      !open && "-rotate-90 opacity-100",
                    )}
                    strokeWidth={1.5}
                  />
                </button>
              )}
              {open && (
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const active = item.key === activeKey;
                    const href = sectionHref(projectId, item.section, item.to);
                    const count = item.badge ? counts[item.badge] : 0;
                    return (
                      <li key={item.key}>
                        <Link
                          to={href.to}
                          search={href.search as never}
                          onClick={onClose}
                          data-tour={`nav-${item.key}`}
                          title={item.label}
                          data-active={active}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "nav-item focus-ring transition-fast",
                            collapsed && "lg:justify-center lg:px-0",
                          )}
                        >
                          <item.icon strokeWidth={1.5} />
                          <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>
                            {item.label}
                          </span>
                          {count > 0 && (
                            <span
                              className={cn(
                                "nav-badge",
                                item.badge &&
                                  CRITICAL_BADGES.includes(item.badge) &&
                                  "nav-badge-critical",
                                collapsed && "lg:hidden",
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

      {/* Нижний блок: без линии, пункты того же вида */}
      <div className="shrink-0 space-y-1 pt-6">
        {dataSource === "demo" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                title="Сбросить демо-данные"
                className={cn(
                  "nav-item focus-ring w-full transition-fast",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                <span className="nav-icon-circle">
                  <RotateCcw strokeWidth={1.5} />
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-left", collapsed && "lg:hidden")}>
                  Сбросить демо-данные
                </span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Сбросить демо-данные?</AlertDialogTitle>
                <AlertDialogDescription>
                  Созданные объекты, проверенные позиции, запросы, предложения и решения удалятся.
                  Данные вернутся к исходному состоянию демонстрации.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await resetDemo();
                    setProjectId(ALL_PROJECTS);
                    onClose();
                    navigate({ to: "/projects" });
                    toast.success("Демо-данные сброшены");
                  }}
                >
                  Сбросить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {/* Карточка пользователя: имя, роль и переключение персоны демонстрации (ADR-008) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={user ? `${user.name}, ${user.roleLabel}. Сменить роль` : "Сменить роль"}
              title={user ? `${user.name}, ${user.roleLabel}` : undefined}
              className={cn(
                "nav-item focus-ring w-full text-left transition-fast",
                collapsed && "lg:justify-center lg:px-0",
              )}
            >
              <span className="nav-icon-circle">{initials}</span>
              <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
                <span className="block truncate">{user?.name}</span>
                <span className="block truncate text-[12px] leading-[1.35] text-text-3">
                  {user?.roleLabel}
                </span>
              </span>
              <ChevronsUpDown
                className={cn("size-3.5 shrink-0 text-text-3", collapsed && "lg:hidden")}
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-[248px]">
            <DropdownMenuLabel className="text-[12px] font-normal text-text-3">
              Роль в демонстрации
            </DropdownMenuLabel>
            {personas.map((person) => (
              <DropdownMenuItem
                key={person.id}
                onSelect={() => switchPersona(person.id, person.role)}
                className="gap-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{person.name}</span>
                  <span className="block truncate text-[12px] text-text-3">
                    {employeeRoleLabel[person.role]}
                  </span>
                </span>
                {person.id === personaId && (
                  <Check className="size-4 shrink-0 text-orange-hot" strokeWidth={2} aria-hidden />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-[12px] leading-[1.4] text-text-3">
              У каждой роли свои права: закрытые разделы не показываются, сервер отклоняет действия
              без права. Матрица — в разделе «Права доступа».
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
