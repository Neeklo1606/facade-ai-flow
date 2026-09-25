import type { EmployeeRole } from "@/contracts";
import { can, type Section } from "@/domain/access";
import {
  Users,
  BookOpen,
  Boxes,
  Building2,
  FileText,
  HardHat,
  History,
  LayoutDashboard,
  LifeBuoy,
  PackageCheck,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type BadgeKey = "unverifiedSpec" | "overdueRequests" | "openChanges" | "deliveriesToAccept";

/** Разделы, которые ведутся внутри объекта. */
export type ProjectSection =
  | "documents"
  | "materials"
  | "procurement"
  | "suppliers"
  | "deliveries"
  | "field-reports"
  | "timeline";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: BadgeKey;
  /** Раздел прав (ADR-012): пункт виден роли, которой раздел доступен хотя бы на чтение */
  /**
   * Раздел прав, которым открывается пункт (ADR-012). Без него пункт видят все роли:
   * так открыта справка — она не показывает данные объекта, а учит с ними работать
   */
  access?: Section;
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
        access: "dashboard",
      },
      { key: "projects", label: "Объекты", icon: Building2, access: "projects" },
      { key: "agent", label: "Ассистент", icon: Sparkles, to: "/agent", access: "agent" },
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
        access: "documents",
      },
      {
        key: "materials",
        label: "Материалы",
        icon: Boxes,
        badge: "unverifiedSpec",
        section: "materials",
        access: "materials",
      },
      {
        key: "procurement",
        label: "Закупки",
        icon: PackageSearch,
        badge: "overdueRequests",
        section: "procurement",
        access: "procurement",
      },
      {
        key: "deliveries",
        label: "Поставки",
        icon: PackageCheck,
        badge: "deliveriesToAccept",
        section: "deliveries",
        access: "deliveries",
      },
      {
        key: "suppliers",
        label: "Поставщики",
        icon: Truck,
        section: "suppliers",
        access: "suppliers",
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
        access: "field-reports",
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
        access: "timeline",
      },
      {
        key: "catalogs",
        label: "Справочники",
        icon: BookOpen,
        to: "/catalogs",
        access: "catalogs",
      },
      {
        key: "users",
        label: "Сотрудники и доступ",
        icon: Users,
        to: "/users",
        access: "access",
      },
      {
        key: "access",
        label: "Права доступа",
        icon: ShieldCheck,
        to: "/access",
        access: "access",
      },
      // Справка открыта всем ролям: она не показывает данные объекта (ADR-019)
      { key: "help", label: "Справка", icon: LifeBuoy, to: "/help" },
    ],
  },
];

export const allNavItems = navGroups.flatMap((g) => g.items);

/** Видит ли роль этот пункт меню: по матрице прав (ADR-012) */
export function visibleFor(item: NavItem, role: EmployeeRole) {
  return item.access ? can(role, item.access) : true;
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
  return can(role, "dashboard") ? "/" : `/projects/${projectId}`;
}

export const sectionLabels: Record<ProjectSection, string> = {
  documents: "Документация",
  materials: "Материалы",
  procurement: "Поставщики и запросы",
  suppliers: "Поставщики",
  deliveries: "Поставки",
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
  if (pathname === "/access") return "access";
  if (pathname === "/catalogs") return "catalogs";
  if (pathname === "/projects" && pickSection) return pickSection;
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/?]+))?/);
  if (!match) return pathname.startsWith("/projects") ? "projects" : null;
  const section = match[1];
  if (!section) return "projects";
  if (section === "procurement") return view === "suppliers" ? "suppliers" : "procurement";
  return section;
}
