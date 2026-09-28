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

/* ---------- Нижняя панель телефона (ADR-026) ---------- */

/** Позиция панели: ключ пункта меню, подпись и куда ведёт */
export interface BottomNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  search?: Record<string, string>;
  badge?: BadgeKey;
  /** Активна ли позиция на этом адресе */
  active: (pathname: string, view: string, pickSection: string) => boolean;
}

/** Действие шторки «+»: ведёт на экран, где живёт форма, и открывает её адресом */
export interface PlusAction {
  key: string;
  label: string;
  /** Что произойдёт — одной строкой: человек должен знать до нажатия */
  hint: string;
  icon: LucideIcon;
  to: string;
  search?: Record<string, string>;
}

const inSection = (name: string) => (pathname: string) =>
  new RegExp(`^/projects/[^/]+/${name}`).test(pathname);

/**
 * Набор позиций панели по роли (ADR-026, п. 2). Две слева, «+» в центре, одна справа,
 * «Ещё» последней — «Ещё» и «+» рисует сама панель. Состав определяется матрицей ADR-012
 * и стартовым экраном роли (ADR-008): у снабжения нет дашборда, у ПТО нет материалов,
 * прораб видит только свои объекты.
 *
 * Без выбранного объекта разделы объекта ведут в реестр с просьбой выбрать — тем же
 * механизмом, что сайдбар (`sectionHref`).
 */
export function bottomNavFor(role: EmployeeRole, projectId: string | null): BottomNavItem[] {
  const section = (
    key: string,
    label: string,
    icon: LucideIcon,
    name: ProjectSection,
    badge?: BadgeKey,
  ): BottomNavItem => {
    const href = sectionHref(projectId, name);
    return {
      key,
      label,
      icon,
      to: href.to,
      ...(Object.keys(href.search).length ? { search: href.search as Record<string, string> } : {}),
      ...(badge ? { badge } : {}),
      active: (pathname, view, pickSection) =>
        projectId
          ? name === "suppliers"
            ? inSection("procurement")(pathname) && view === "suppliers"
            : name === "procurement"
              ? inSection("procurement")(pathname) && view !== "suppliers"
              : inSection(name)(pathname)
          : pickSection === name,
    };
  };

  const dashboard: BottomNavItem = {
    key: "dashboard",
    label: "Дашборд",
    icon: LayoutDashboard,
    to: "/",
    active: (pathname) => pathname === "/",
  };
  const projects: BottomNavItem = {
    key: "projects",
    label: projectId ? "Объект" : "Объекты",
    icon: Building2,
    to: projectId ? `/projects/${projectId}` : "/projects",
    active: (pathname, _view, pickSection) =>
      projectId
        ? /^\/projects\/[^/]+\/?$/.test(pathname)
        : pathname === "/projects" && !pickSection,
  };
  const documents = section("documents", "Документация", FileText, "documents");
  const materials = section("materials", "Материалы", Boxes, "materials", "unverifiedSpec");
  const procurement = section(
    "procurement",
    "Закупки",
    PackageSearch,
    "procurement",
    "overdueRequests",
  );
  const deliveries = section(
    "deliveries",
    "Поставки",
    PackageCheck,
    "deliveries",
    "deliveriesToAccept",
  );
  const reports = section("field-reports", "Отчёты", HardHat, "field-reports");
  const catalogs: BottomNavItem = {
    key: "catalogs",
    label: "Справочники",
    icon: BookOpen,
    to: "/catalogs",
    active: (pathname) => pathname === "/catalogs",
  };

  const byRole: Partial<Record<EmployeeRole, BottomNavItem[]>> = {
    manager: [dashboard, projects, procurement],
    supply: [procurement, materials, deliveries],
    pto: [documents, reports, catalogs],
    foreman: [reports, deliveries, projects],
    director: [dashboard, projects, procurement],
  };
  // Роль вне матрицы (finance, worker) видит только реестр: панель не выдумывает ей разделы
  const items = byRole[role] ?? [projects];
  return items.filter((item) => {
    const nav = allNavItems.find((navItem) => navItem.key === item.key);
    return !nav || visibleFor(nav, role);
  });
}

/**
 * Действия шторки «+» (ADR-026, п. 4): только то, что продукт умеет сегодня. Каждое ведёт
 * на экран, где живёт форма, и открывает её адресом `?new=…` — глобального окна нет, потому
 * что форме нужен контекст экрана. Голоса и бота здесь нет: их нет в продукте.
 */
export function plusActionsFor(role: EmployeeRole, projectId: string | null): PlusAction[] {
  const project = (path: string) => (projectId ? `/projects/${projectId}${path}` : "/projects");
  const report: PlusAction = {
    key: "report",
    label: "Отчёт с площадки",
    hint: "Смена, объём по захватке, что мешало",
    icon: HardHat,
    to: project("/field-reports"),
    ...(projectId ? { search: { new: "report" } } : {}),
  };
  const document: PlusAction = {
    key: "document",
    label: "Документ в реестр",
    hint: "Откроется зона загрузки: PDF, DOCX или XLSX",
    icon: FileText,
    to: project("/documents"),
    ...(projectId ? { search: { new: "document" } } : {}),
  };
  const request: PlusAction = {
    key: "request",
    label: "Запрос поставщикам",
    hint: "Из позиций, готовых к запросу",
    icon: PackageSearch,
    to: project("/materials"),
    ...(projectId ? { search: { new: "request" } } : {}),
  };
  const supplier: PlusAction = {
    key: "supplier",
    label: "Поставщик",
    hint: "Регион и категории решают, кому уйдёт запрос",
    icon: Truck,
    to: project("/procurement"),
    ...(projectId ? { search: { view: "suppliers", new: "supplier" } } : {}),
  };
  const acceptance: PlusAction = {
    key: "acceptance",
    label: "Приёмка поставки",
    hint: "Открывает список поставок: приёмка начинается с выбора",
    icon: PackageCheck,
    to: project("/deliveries"),
  };
  const material: PlusAction = {
    key: "material",
    label: "Материал в справочник",
    hint: "Наименование, единица, категория",
    icon: Boxes,
    to: "/catalogs",
    search: { new: "material" },
  };
  const nomenclature: PlusAction = {
    key: "import",
    label: "Номенклатура из Excel",
    hint: "Выгрузка из 1С: сопоставление колонок и предпросмотр",
    icon: BookOpen,
    to: "/catalogs",
    search: { new: "import" },
  };
  const newProject: PlusAction = {
    key: "project",
    label: "Объект",
    hint: "Название, код, регион, заказчик, сроки",
    icon: Building2,
    to: "/projects",
    search: { new: "project" },
  };
  const employee: PlusAction = {
    key: "employee",
    label: "Сотрудник",
    hint: "Роль, объекты и приглашение по ссылке",
    icon: Users,
    to: "/users",
    search: { new: "employee" },
  };

  const byRole: Partial<Record<EmployeeRole, PlusAction[]>> = {
    manager: [report, newProject, employee],
    supply: [request, supplier, nomenclature],
    pto: [document, report, material],
    foreman: [report, acceptance],
  };
  // Директор видит всё и не меняет ничего: кнопки без действия у него быть не должно
  return byRole[role] ?? [];
}
