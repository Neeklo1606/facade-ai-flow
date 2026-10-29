/**
 * Верхняя строка и плавающая капсула ГАЙКИ в «Монохроме» (ADR-055, 2.1 и 2.4). Заменяют
 * левую панель на компьютере: знак и выбор объекта слева, меню-таблетка роли по центру
 * (первая группа меню, остальные группы в «Ещё»), справа метка «Демо», колокольчик и аватар.
 * Капсула: поиск, модули, настройки (сброс демо, выход), справка по экрану, тема.
 *
 * Строка экрана (заголовок, крошки, действия экрана) остаётся в Topbar под этой строкой.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, LayoutGrid, LogOut, RotateCcw, Search, Settings } from "lucide-react";
import { useState } from "react";
import { queries } from "@/api/queries";
import { dataSource } from "@/api/config";
import { signOutFn } from "@/api/auth-functions";
import { ScreenHelp } from "@/components/guide/ScreenHelp";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BellButton,
  BrandTile,
  FloatingCapsule,
  PillMenu,
  type AttentionItem,
  type CapsuleAction,
  type MenuItem,
} from "@/components/shell/mono";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { badgeCounts } from "@/lib/badges";
import { activeNavKey, homeRouteFor, navGroupsFor, sectionHref } from "@/lib/navigation";
import { useCurrentRole, useCurrentUser, useProjectId } from "@/lib/project-scope";
import { DemoReset } from "./DemoReset";
import { RoleSheet } from "./RoleSheet";
import { ThemeToggle } from "./ThemeToggle";
import { DemoMark } from "./Topbar";

/** Пункты меню роли со счётчиками: первая группа в таблетке, остальные группами в «Ещё» */
function useMenu() {
  const role = useCurrentRole();
  const projectId = useProjectId();
  const { data: registry = [] } = useQuery(queries.projects());
  const counts = badgeCounts(
    projectId,
    registry.map((item) => item.overview),
  );
  const groups = navGroupsFor(role);
  const toItem = (item: (typeof groups)[number]["items"][number]): MenuItem => {
    const href = sectionHref(projectId, item.section, item.to);
    return {
      key: item.key,
      to: href.to,
      search: href.search as Record<string, unknown> | undefined,
      label: item.label,
      count: item.badge ? counts[item.badge] : undefined,
    };
  };
  const [first, ...rest] = groups;
  return {
    items: (first?.items ?? []).map(toItem),
    more: rest.map((group) => ({ title: group.title, items: group.items.map(toItem) })),
  };
}

/** Выбор объекта: тот же список, что был в левой панели; на экране объекта ведёт в тот же раздел */
function ProjectSelect() {
  const { setProjectId } = useApp();
  const projectId = useProjectId();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { data: registry = [] } = useQuery(queries.projects());
  const projects = registry.map((item) => item.project);
  const change = (value: string) => {
    setProjectId(value);
    const match = pathname.match(
      /^\/projects\/[^/]+(\/(documents|materials|procurement|deliveries|field-reports|timeline))?/,
    );
    if (!match) return;
    if (value === ALL_PROJECTS) {
      void navigate({ to: "/projects" });
      return;
    }
    void navigate({ to: `/projects/${value}${match[1] ?? ""}` });
  };
  const label = projectId
    ? (projects.find((p) => p.id === projectId)?.name ?? "Объект")
    : "Все объекты";
  return (
    <label className="relative flex min-w-0 max-w-56 flex-col" title={label}>
      <span className="type-small text-ink-3">Текущий объект</span>
      <select
        value={projectId ?? ALL_PROJECTS}
        onChange={(event) => change(event.target.value)}
        className="min-h-6 w-full cursor-pointer appearance-none truncate bg-transparent pe-6 type-label text-ink focus-ring"
      >
        <option value={ALL_PROJECTS}>Все объекты</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-1 size-4 text-ink-3"
        strokeWidth={1.5}
      />
    </label>
  );
}

export function AppTopRow() {
  const role = useCurrentRole();
  const user = useCurrentUser();
  const [roles, setRoles] = useState(false);
  const { items, more } = useMenu();
  const location = useRouterState({ select: (s) => s.location });
  const search = location.search as Record<string, unknown>;
  const activeKey = activeNavKey(
    location.pathname,
    String(search["view"] ?? ""),
    typeof search["section"] === "string" ? search["section"] : null,
  );
  const attention: AttentionItem[] = [...items, ...more.flatMap((section) => section.items)]
    .filter((item) => (item.count ?? 0) > 0)
    .map((item) => ({
      key: item.key,
      to: item.to,
      text: `${item.label}: ${item.count}`,
      count: item.count ?? 0,
    }));
  const initials = user?.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <header className="shell-header mono-topbar max-lg:hidden">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <Link
          to={homeRouteFor(role)}
          aria-label="гайка, рабочий экран"
          className="rounded-tile focus-ring"
        >
          <BrandTile />
        </Link>
        <ProjectSelect />
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <PillMenu items={items} more={more} activeKey={activeKey} label="Главное меню" />
      </div>
      <DemoMark />
      <BellButton items={attention} allTo="/attention" />
      {user ? (
        <>
          <button
            type="button"
            onClick={dataSource === "demo" ? () => setRoles(true) : undefined}
            aria-label={`Вы смотрите как ${user.roleLabel}. Сменить роль`}
            title={`${user.name}, ${user.roleLabel}`}
            className="mono-circle focus-ring press"
          >
            <span aria-hidden className="type-label font-semibold">
              {initials}
            </span>
          </button>
          <RoleSheet open={roles} onOpenChange={setRoles} />
        </>
      ) : null}
    </header>
  );
}

/** Контуры продукта: учёт времени бригад, ГАЙКА с объекта и кабинет компании */
function ModulesList() {
  const role = useCurrentRole();
  const office = role === "manager" || role === "director" || role === "pto" || role === "supply";
  const modules = [
    {
      key: "field",
      to: homeRouteFor(role),
      label: "Голос с объекта",
      note: "Этот контур",
      current: true,
    },
    {
      key: "gas",
      to: "/gas",
      label: "Учёт времени бригад",
      note: "Время и выработка",
      current: false,
    },
    ...(office
      ? [
          {
            key: "office",
            to: "/office",
            label: "Кабинет компании",
            note: "Справочники и подключения",
            current: false,
          },
        ]
      : []),
  ];
  return (
    <>
      <p className="px-3 pt-2 pb-1 type-label text-ink-3">Модули</p>
      <ul className="flex flex-col">
        {modules.map((m) => (
          <li key={m.key}>
            <Link
              to={m.to}
              aria-current={m.current ? "page" : undefined}
              className="flex min-h-12 flex-col justify-center rounded-tile px-3 py-2 focus-ring is-hover:bg-panel-2 aria-[current=page]:bg-panel-2"
            >
              <span className="type-text font-medium">{m.label}</span>
              <span className="type-small text-ink-3">{m.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AppCapsule() {
  const { setCommandOpen } = useApp();
  const actions: (CapsuleAction | null)[] = [
    {
      key: "search",
      label: "Найти в системе, Ctrl K",
      icon: Search,
      onClick: () => setCommandOpen(true),
    },
    {
      key: "modules",
      label: "Модули",
      icon: LayoutGrid,
      render: (trigger) => (
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            side="right"
            align="center"
            sideOffset={16}
            className="w-72 rounded-inset p-2 shadow-floating"
          >
            <ModulesList />
          </PopoverContent>
        </Popover>
      ),
    },
    null,
    {
      key: "settings",
      label: "Настройки",
      icon: Settings,
      render: (trigger) => (
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            side="right"
            align="center"
            sideOffset={16}
            className="w-64 rounded-inset p-2 shadow-floating"
          >
            <p className="px-3 pt-2 pb-1 type-label text-ink-3">Настройки</p>
            {dataSource === "demo" ? (
              <DemoReset
                trigger={
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-tile px-3 type-text focus-ring is-hover:bg-panel-2"
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    Сбросить демо-данные
                  </button>
                }
              />
            ) : (
              <button
                type="button"
                onClick={() => void signOutFn().then(() => window.location.assign("/login"))}
                className="flex min-h-11 w-full items-center gap-2 rounded-tile px-3 type-text focus-ring is-hover:bg-panel-2"
              >
                <LogOut className="size-4" aria-hidden />
                Выйти
              </button>
            )}
          </PopoverContent>
        </Popover>
      ),
    },
    {
      key: "help",
      label: "Справка",
      icon: Search,
      node: <ScreenHelp className="mono-capsule-button" side="right" />,
    },
    null,
    {
      key: "theme",
      label: "Тема",
      icon: Search,
      node: <ThemeToggle className="mono-capsule-button" side="right" />,
    },
  ];
  return <FloatingCapsule actions={actions} />;
}
