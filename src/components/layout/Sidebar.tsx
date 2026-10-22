import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Check,
  LogOut,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Hexagon,
  Mic,
  RotateCcw,
  X,
  Search,
} from "lucide-react";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import {
  activeNavKey,
  navGroupsFor,
  plusActionsFor,
  sectionHref,
  type BadgeKey,
} from "@/lib/navigation";
import { useCurrentRole, useCurrentUser, useProjectId } from "@/lib/project-scope";
import { useEnterAs } from "@/lib/persona";
import { signOutFn } from "@/api/auth-functions";
import { DemoReset } from "./DemoReset";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { themeChoices, themeLabels, type ThemeChoice } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { employeeRoleLabel, type EmployeeRole, type ProjectOverview } from "@/contracts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CRITICAL_BADGES, badgeCounts, badgeText } from "@/lib/badges";

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useApp();
  // Компьютер — подписи или сворачивание по выбору, планшет — рельс,
  // телефон — модальная панель с полными подписями.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const phone = useMediaQuery("(max-width: 767px)", false);
  // Планшет 768–1023: рельс 72 вместо нижней панели (ADR-045, 4.1 и V7)
  const tablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  const collapsed = tablet || (desktop && sidebarCollapsed);

  useEffect(() => {
    if (!phone) setMobileNavOpen(false);
  }, [phone, setMobileNavOpen]);

  if (phone) {
    return (
      <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="mobile-nav-overlay fixed inset-0 z-50" />
          <Dialog.Content
            id="mobile-navigation"
            aria-describedby={undefined}
            className="mobile-nav-panel fixed inset-y-0 left-0 z-50 flex flex-col bg-base outline-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.querySelector<HTMLElement>('[aria-label="Открыть меню"]')?.focus();
            }}
          >
            <Dialog.Title className="sr-only">Главное меню</Dialog.Title>
            <aside
              aria-label="Главное меню"
              data-sidebar="app"
              className="flex min-h-0 flex-1 flex-col"
            >
              <SidebarInner
                collapsed={false}
                canToggle={false}
                onToggle={toggleSidebar}
                onClose={() => setMobileNavOpen(false)}
              />
            </aside>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <>
      <aside
        aria-label="Главное меню"
        data-sidebar="app"
        className={cn(
          // На телефоне меню выезжает поверх экрана и нуждается в фоне; в оболочке сайдбар прозрачный
          "fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-w)] shrink-0 flex-col bg-base transition-[width,transform,visibility] duration-150 ease-out md:relative md:inset-auto md:h-full md:translate-x-0 md:bg-transparent",
          collapsed ? "md:w-[72px]" : "md:w-[var(--sidebar-w)]",
          // Закрытое выдвижное меню скрыто от фокуса и диктора; скрытие ждёт конца выезда (ADR-015, п. 3)
          mobileNavOpen ? "translate-x-0" : "-translate-x-full max-md:invisible",
        )}
      >
        <SidebarInner
          collapsed={collapsed}
          canToggle={desktop}
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
  /** Сворачивание вручную доступно на компьютере. */
  canToggle: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { setProjectId, personaId, themeChoice, setThemeChoice, setCommandOpen } = useApp();
  const enterAs = useEnterAs();
  const user = useCurrentUser();
  // Меню зависит от роли выбранной персоны (ADR-008): снабжение не ведёт площадку,
  // прораб не занимается закупками
  const groups = navGroupsFor(user?.role ?? "manager");
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
  /** Выход: сессия гаснет на сервере, дальше сервер сам уводит на экран входа (ADR-021) */
  const signOut = async () => {
    onClose();
    await signOutFn();
    window.location.assign("/login");
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
  const role = useCurrentRole();
  const canRecord = plusActionsFor(role, projectId).length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      {/* Шапка сайдбара, 60px */}
      <div className={cn("sidebar-header", collapsed && "md:justify-center md:px-0")}>
        <span
          className={cn(
            "grid size-[26px] shrink-0 place-items-center rounded-[var(--r-xs)] bg-surface-3 text-text",
          )}
        >
          <Hexagon className="size-[15px]" strokeWidth={1.5} />
        </span>
        <div className={cn("flex min-w-0 flex-1 items-center gap-1.5", collapsed && "md:hidden")}>
          {/*
            Марка ГАЙКИ: имя строчными, знак — заглушка шестигранником. Фирменный знак и цвета
            официально не утверждены (дизайн-система, преамбула), поэтому в коде заглушка,
            а не нарисованный логотип. Вторая строка — категория из позиционирования.
          */}
          <span className="min-w-0">
            <span className="text-heading block truncate text-text">гайка</span>
            <span className="text-meta block truncate text-text-3">с объекта</span>
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          aria-label="Закрыть меню"
          className="focus-ring grid size-12 shrink-0 place-items-center rounded-full text-text-3 hover:bg-surface-2 hover:text-text md:hidden"
        >
          <X className="size-5" strokeWidth={1.5} />
        </Button>
      </div>

      {/*
        Планшет (ADR-045, V7): голосовая кнопка в рельсе сверху, на месте центра нижней панели.
        С 1024 запись открывается из шапки и меню, рельс компьютера кнопку не дублирует.
      */}
      {canRecord ? (
        <Link
          to="/capture"
          aria-label="Говорить: открыть запись"
          className="focus-ring press-98 mx-auto mb-3 hidden size-14 shrink-0 place-items-center rounded-full bg-pill text-pill-text md:grid lg:hidden"
        >
          <Mic className="size-6" strokeWidth={2} aria-hidden />
        </Link>
      ) : null}

      {/* Селектор объекта */}
      {!collapsed && (
        <label className="scope-card mt-1 mb-4 shrink-0" title={siteLabel}>
          <span className="text-meta block text-text-2">Текущий объект</span>
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

      <Button
        variant="outline"
        onClick={() => {
          onClose();
          setCommandOpen(true);
        }}
        aria-label="Найти в системе"
        title="Найти в системе"
        className={cn("mb-3 w-full justify-start px-3", collapsed && "md:justify-center md:px-0")}
      >
        <Search aria-hidden />
        <span className={cn("text-meta", collapsed && "md:hidden")}>Найти в системе</span>
      </Button>

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
                            collapsed && "md:justify-center md:px-0",
                          )}
                        >
                          <item.icon strokeWidth={1.5} />
                          <span
                            className={cn(
                              "min-w-0 flex-1 max-md:whitespace-normal max-md:break-words md:truncate",
                              collapsed && "md:hidden",
                            )}
                          >
                            {item.label}
                          </span>
                          {count > 0 && (
                            <span
                              className={cn(
                                "nav-badge",
                                item.badge &&
                                  CRITICAL_BADGES.includes(item.badge) &&
                                  "nav-badge-critical",
                                collapsed && "md:hidden",
                              )}
                            >
                              {badgeText(count)}
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
        {/*
          «Свернуть панель» внизу (ADR-045, 4.2): рельс 72 с иконками, подпись пункта видна
          подсказкой по наведению и фокусу (title дублирует подпись). Состояние запоминается.
        */}
        {canToggle ? (
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? "Развернуть панель" : "Свернуть панель"}
            aria-label={collapsed ? "Развернуть панель" : "Свернуть панель"}
            aria-expanded={!collapsed}
            className={cn(
              "nav-item focus-ring hidden w-full text-left transition-fast lg:flex",
              collapsed && "md:justify-center md:px-0",
            )}
          >
            {collapsed ? <ChevronsRight strokeWidth={1.5} /> : <ChevronsLeft strokeWidth={1.5} />}
            <span className={cn("min-w-0 flex-1 truncate", collapsed && "md:hidden")}>
              Свернуть панель
            </span>
          </button>
        ) : null}
        {dataSource === "demo" && (
          <DemoReset
            onDone={onClose}
            trigger={
              <button
                type="button"
                title="Сбросить демо-данные"
                aria-label="Сбросить демо-данные"
                className={cn(
                  "nav-item focus-ring w-full transition-fast",
                  collapsed && "md:justify-center md:px-0",
                )}
              >
                <span className="nav-icon-circle">
                  <RotateCcw strokeWidth={1.5} />
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-left", collapsed && "md:hidden")}>
                  Сбросить демо
                </span>
              </button>
            }
          />
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
                collapsed && "md:justify-center md:px-0",
              )}
            >
              <span className="nav-icon-circle">{initials}</span>
              <span className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
                <span className="block truncate">{user?.name}</span>
                <span className="text-meta block truncate text-text-3">{user?.roleLabel}</span>
              </span>
              <ChevronsUpDown
                className={cn("size-3.5 shrink-0 text-text-3", collapsed && "md:hidden")}
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-[248px]">
            {/* Персону выбирают только в демонстрации: в рабочем контуре роль даёт учётная
                запись, за которую вошли (ADR-021, п. 7) */}
            {dataSource === "demo" && (
              <DropdownMenuLabel className="text-meta font-normal text-text-3">
                Роль в демонстрации
              </DropdownMenuLabel>
            )}
            {dataSource === "demo" &&
              personas.map((person) => (
                <DropdownMenuItem
                  key={person.id}
                  onSelect={() => switchPersona(person.id, person.role)}
                  className="gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-meta-strong block truncate font-medium">
                      {person.name}
                    </span>
                    <span className="text-meta block truncate text-text-3">
                      {employeeRoleLabel[person.role]}
                    </span>
                  </span>
                  {person.id === personaId && (
                    <Check
                      className="size-4 shrink-0 text-orange-hot"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <p className="text-meta px-2 py-1.5 text-text-3">
              У каждой роли свои права: закрытые разделы не показываются, сервер отклоняет действия
              без права. Матрица — в разделе «Права доступа».
            </p>
            <DropdownMenuSeparator />
            {dataSource === "server" && (
              <>
                <DropdownMenuItem onSelect={() => void signOut()} className="gap-2">
                  <LogOut className="size-4 shrink-0 text-text-3" strokeWidth={1.75} aria-hidden />
                  <span className="text-meta">Выйти</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {/* Тема здесь же: на телефоне переключателя в шапке нет (ADR-017, п. 5) */}
            <DropdownMenuLabel className="text-meta font-normal text-text-3">
              Тема оформления
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={themeChoice}
              onValueChange={(value) => setThemeChoice(value as ThemeChoice)}
            >
              {themeChoices.map((choice) => (
                <DropdownMenuRadioItem key={choice} value={choice} className="gap-2">
                  <span className="text-meta min-w-0 flex-1 truncate">{themeLabels[choice]}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
