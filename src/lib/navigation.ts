import type { EmployeeRole } from "@/contracts";
import {
  Boxes,
  Building2,
  FileText,
  HardHat,
  History,
  LayoutDashboard,
  PackageSearch,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type BadgeKey = "unverifiedSpec" | "overdueRequests" | "openChanges";

/** Разделы, которые ведутся внутри объекта. */
export type ProjectSection =
  "documents" | "materials" | "procurement" | "suppliers" | "field-reports" | "timeline";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: BadgeKey;
  /**
   * Роли, которым пункт не показывается. Временное решение демонстрации (ADR-008):
   * настоящие права и запрет прямых переходов — блок B.
   */
  hiddenFor?: EmployeeRole[];
  /** Раздел объекта; без выбранного объекта пункт ведёт в реестр с просьбой выбрать объект */
  section?: ProjectSection;
  /** Экран вне объекта: ведёт по этому адресу, а не в раздел объекта */
  to?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    title: "Обзор",
    items: [
      {
        key: "dashboard",
        label: "Дашборд",
        icon: LayoutDashboard,
        to: "/",
        hiddenFor: ["foreman"],
      },
      { key: "projects", label: "Объекты", icon: Building2 },
      { key: "agent", label: "Ассистент", icon: Sparkles, to: "/agent" },
    ],
  },
  {
    title: "Работа",
    items: [
      {
        key: "documents",
        label: "Документация",
        icon: FileText,
        section: "documents",
        hiddenFor: ["foreman"],
      },
      {
        key: "materials",
        label: "Материалы",
        icon: Boxes,
        badge: "unverifiedSpec",
        section: "materials",
        hiddenFor: ["foreman"],
      },
      {
        key: "procurement",
        label: "Закупки",
        icon: PackageSearch,
        badge: "overdueRequests",
        section: "procurement",
        hiddenFor: ["foreman"],
      },
      {
        key: "suppliers",
        label: "Поставщики",
        icon: Truck,
        section: "suppliers",
        hiddenFor: ["foreman"],
      },
    ],
  },
  {
    title: "Площадка",
    items: [
      {
        key: "field-reports",
        label: "Отчёты с площадки",
        icon: HardHat,
        section: "field-reports",
        hiddenFor: ["supply"],
      },
    ],
  },
  {
    title: "Управление",
    items: [
      {
        key: "timeline",
        label: "История и решения",
        icon: History,
        section: "timeline",
        hiddenFor: ["supply", "foreman"],
      },
    ],
  },
];

export const allNavItems = navGroups.flatMap((g) => g.items);

/** Видит ли роль этот пункт меню */
export function visibleFor(item: NavItem, role: EmployeeRole) {
  return !item.hiddenFor?.includes(role);
}

/** Меню для роли: пустые группы не показываем (ADR-008) */
export function navGroupsFor(role: EmployeeRole): NavGroup[] {
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleFor(item, role)) }))
    .filter((group) => group.items.length > 0);
}

/** Пункты меню, доступные роли: сайдбар, нижняя панель и палитра команд берут один список */
export function navItemsFor(role: EmployeeRole) {
  return allNavItems.filter((item) => visibleFor(item, role));
}

/**
 * Стартовый экран роли (ADR-008, ADR-010): руководителю и директору — сводка по всем объектам,
 * снабжению — закупки, ПТО — документация, прорабу — отчёты с площадки. Без объектов в системе всем открывается реестр.
 *
 * Применяется один раз за вкладку, при входе в демонстрацию (см. `startScreenPending`):
 * иначе пункт меню «Дашборд» у снабжения был бы кнопкой без результата — переход тут же
 * возвращал на закупки (находка ревью HIGH). Вход — первый отрисованный экран вкладки,
 * поэтому отметку ставит корневой маршрут, а не «/» (находка повторного ревью).
 */
const START_KEY = "neeklo-fieldops-start-applied";

/** Нужно ли ещё открывать стартовый экран роли: до первого применения в этой вкладке */
export function startScreenPending() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(START_KEY) !== "1";
  } catch {
    return false;
  }
}

/** Отметить, что вход в демонстрацию состоялся: стартовый экран роли больше не применяется */
export function markStartScreenApplied() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(START_KEY, "1");
  } catch {
    // Приватный режим: стартовый экран применится ещё раз, это не мешает работе
  }
}

export function startRouteFor(role: EmployeeRole, projectId: string | null) {
  if (!projectId) return "/projects";
  if (role === "supply") return `/projects/${projectId}/procurement`;
  if (role === "foreman") return `/projects/${projectId}/field-reports`;
  if (role === "pto") return `/projects/${projectId}/documents`;
  return "/";
}

export const sectionLabels: Record<ProjectSection, string> = {
  documents: "Документация",
  materials: "Материалы",
  procurement: "Поставщики и запросы",
  suppliers: "Поставщики",
  "field-reports": "Отчёты с площадки",
  timeline: "История и решения",
};

/**
 * Куда ведёт раздел. При выбранном объекте — на экран объекта, иначе в реестр,
 * который попросит выбрать объект и откроет нужный раздел.
 */
export function sectionHref(
  projectId: string | null,
  section: ProjectSection | undefined,
  to?: string,
  /** Фильтр раздела: дашборд ведёт сразу в отфильтрованный список (ADR-007) */
  sectionStatus?: string,
) {
  const filter = sectionStatus ? { status: sectionStatus } : {};
  if (to) return { to, search: {} };
  if (!section) return { to: "/projects", search: {} };
  if (!projectId)
    return { to: "/projects", search: sectionStatus ? { section, sectionStatus } : { section } };
  if (section === "suppliers")
    return { to: `/projects/${projectId}/procurement`, search: { view: "suppliers" } };
  return { to: `/projects/${projectId}/${section}`, search: filter };
}

/** Какой пункт меню подсвечивать на текущем адресе. */
export function activeNavKey(pathname: string, view: string, pickSection: string | null) {
  if (pathname === "/") return "dashboard";
  if (pathname === "/agent") return "agent";
  if (pathname === "/projects" && pickSection) return pickSection;
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/?]+))?/);
  if (!match) return pathname.startsWith("/projects") ? "projects" : null;
  const section = match[1];
  if (!section) return "projects";
  if (section === "procurement") return view === "suppliers" ? "suppliers" : "procurement";
  return section;
}
