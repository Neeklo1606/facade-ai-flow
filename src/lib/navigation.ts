import type { EmployeeRole } from "@/contracts";
import { can, type Section } from "@/domain/access";
import {
  isSupplyPath,
  isSupplySection,
  supplyBadgesFor,
  supplyDoorFor,
  SUPPLY_LABEL,
  SUPPLY_SECTIONS,
  SUPPLY_TABS,
} from "./supply";
import {
  Users,
  BookOpen,
  Boxes,
  Building2,
  FileText,
  HardHat,
  History,
  AlertTriangle,
  ClipboardCheck,
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
  /**
   * Счётчики пункта. Их может быть несколько: у раздела «Снабжение» одно место под число,
   * а источников три, и на пункте стоит их сумма (ADR-031, п. 4)
   */
  badges?: BadgeKey[];
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
  /**
   * Пункт виден роли, которой открыт хотя бы один из разделов. Так устроено «Обзор»:
   * это не раздел прав, а сборка из блоков, у каждого своё право (ADR-028)
   */
  anyOf?: Section[];
  /**
   * Роли, которым пункт показывается, когда матрица их не различает. «Проверку» ведут ПТО,
   * руководитель и директор; у прораба право на отчёты такое же, но очередь не его работа —
   * отдельного права «только проверять» в матрице нет (ADR-012). Это удобство, а не защита:
   * адрес открыт всем, у кого есть право на данные.
   */
  roles?: EmployeeRole[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    title: "Главное",
    items: [
      {
        key: "attention",
        label: "Обзор",
        icon: AlertTriangle,
        to: "/attention",
        // Прораба здесь нет: закупки и документы ему закрыты, его экран — «Сегодня»
        anyOf: ["procurement", "documents"],
      },
      {
        key: "today",
        label: "Сегодня",
        icon: LayoutDashboard,
        to: "/today",
        access: "field-reports",
      },
      {
        key: "check",
        label: "Проверка",
        icon: ClipboardCheck,
        to: "/check",
        access: "field-reports",
        roles: ["manager", "pto", "director"],
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
      /*
       * Один пункт на весь снабженческий контур (ADR-031): спецификация, запросы,
       * поставщики и поставки — вкладки одного раздела. Дверь раздела и счётчик зависят
       * от роли, поэтому их подставляет `navItemsFor` и `navGroupsFor`.
       */
      {
        key: "supply",
        label: SUPPLY_LABEL,
        icon: PackageSearch,
        anyOf: SUPPLY_SECTIONS,
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
  if (item.roles && !item.roles.includes(role)) return false;
  if (item.anyOf) return item.anyOf.some((section) => can(role, section));
  return item.access ? can(role, item.access) : true;
}

/**
 * Пункт «Снабжение» зависит от роли: он ведёт на дверь раздела и показывает сумму счётчиков
 * тех вкладок, которые роль видит (ADR-031, пп. 3–4). Остальные пункты одинаковы для всех.
 */
function forRole(item: NavItem, role: EmployeeRole): NavItem {
  if (item.key !== "supply") return item;
  const door = supplyDoorFor(role);
  const badges = supplyBadgesFor(role);
  return {
    ...item,
    ...(door ? { section: door.section } : {}),
    ...(badges.length ? { badges } : {}),
  };
}

/** Меню для роли: пустые группы не показываем (ADR-008) */
export function navGroupsFor(role: EmployeeRole): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => visibleFor(item, role))
        .map((item) => forRole(item, role)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Пункты меню, доступные роли: сайдбар, нижняя панель и палитра команд берут один список */
export function navItemsFor(role: EmployeeRole) {
  return allNavItems.filter((item) => visibleFor(item, role)).map((item) => forRole(item, role));
}

/**
 * Рабочий экран роли (ADR-028): прорабу — «Сегодня», ПТО — «Проверка», остальным — «Обзор».
 * Корень адреса ведёт сюда же, поэтому отметки «стартовый экран уже показан» больше нет:
 * раньше она была нужна, потому что «/» был одновременно дашбордом и перенаправлением,
 * и пункт меню «Дашборд» у снабжения оказывался кнопкой без результата (находка ревью HIGH).
 *
 * Роли без прав на разделы «Внимания» открывают реестр объектов: это их единственный раздел.
 */
export function homeRouteFor(role: EmployeeRole) {
  if (role === "foreman") return "/today";
  if (role === "pto") return "/check";
  if (can(role, "procurement") || can(role, "documents")) return "/attention";
  return "/projects";
}

// Четыре раздела снабжения — вкладки одного раздела, и в просьбе выбрать объект они
// называются так же, как на полосе вкладок (ADR-031)
export const sectionLabels: Record<ProjectSection, string> = {
  documents: "Документация",
  materials: "Снабжение: спецификация",
  procurement: "Снабжение: запросы",
  suppliers: "Снабжение: поставщики",
  deliveries: "Снабжение: поставки",
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
export function activeNavKey(pathname: string, _view: string, pickSection: string | null) {
  if (pathname === "/attention") return "attention";
  if (pathname === "/today") return "today";
  if (pathname === "/check") return "check";
  if (pathname === "/agent") return "agent";
  if (pathname === "/access") return "access";
  if (pathname === "/catalogs") return "catalogs";
  // Разделы снабжения — вкладки одного пункта: подсвечивается он, а не вкладка (ADR-031)
  if (pathname === "/projects" && pickSection)
    return isSupplySection(pickSection) ? "supply" : pickSection;
  if (isSupplyPath(pathname)) return "supply";
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/?]+))?/);
  if (!match) return pathname.startsWith("/projects") ? "projects" : null;
  const section = match[1];
  if (!section) return "projects";
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
  badges?: BadgeKey[];
  /**
   * Пункт меню, которому соответствует позиция, если имя у них разное. У прораба в панели
   * стоит «Поставки», а в меню — «Снабжение»: панель называет работу дня, меню — раздел
   * (ADR-031, п. 5). Нужно, чтобы шторка «Ещё» не повторяла раздел, который уже в панели.
   */
  navKey?: string;
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
 * Набор позиций панели по роли (ADR-026 и поправка от 05.10.2026): таблица целевой карты.
 * Две слева, «+» в центре, одна справа, «Ещё» последней — «Ещё» и «+» рисует сама панель.
 *
 * Первой стоит рабочий экран роли: панель начинается там же, где начинается день.
 * У ПТО вместо «Комплектности» — «Документы» (в модели нет сертификатов и связи работы
 * с документом), вместо «Найти» — «Объекты» до появления единого поиска в N6.
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
    navKey?: string,
  ): BottomNavItem => {
    const href = sectionHref(projectId, name);
    return {
      key,
      label,
      icon,
      to: href.to,
      ...(Object.keys(href.search).length ? { search: href.search as Record<string, string> } : {}),
      ...(badge ? { badges: [badge] } : {}),
      ...(navKey ? { navKey } : {}),
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

  const attention: BottomNavItem = {
    key: "attention",
    label: "Обзор",
    icon: AlertTriangle,
    to: "/attention",
    active: (pathname) => pathname === "/attention",
  };
  const today: BottomNavItem = {
    key: "today",
    label: "Сегодня",
    icon: LayoutDashboard,
    to: "/today",
    active: (pathname) => pathname === "/today",
  };
  const check: BottomNavItem = {
    key: "check",
    label: "Проверка",
    icon: ClipboardCheck,
    to: "/check",
    active: (pathname) => pathname === "/check",
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
  // В панели подпись короче, чем в меню: «Документация» не помещается в позицию 11–12 px
  const documents = section("documents", "Документы", FileText, "documents");
  // Позиции снабжения ведут в раздел (ADR-031): «Поставки» у прораба — вкладка раздела,
  // поэтому у позиции тот же пункт меню, что у «Снабжения»
  const deliveries = section(
    "deliveries",
    "Поставки",
    PackageCheck,
    "deliveries",
    "deliveriesToAccept",
    "supply",
  );
  /**
   * Позиция раздела «Снабжение»: ведёт на дверь роли, активна на любой его вкладке,
   * счётчик — сумма счётчиков доступных вкладок (ADR-031, пп. 3–5).
   */
  const supplyDoor = supplyDoorFor(role);
  const supplyBadges = supplyBadgesFor(role);
  const supply: BottomNavItem | null = supplyDoor
    ? (() => {
        const href = sectionHref(projectId, supplyDoor.section);
        return {
          key: "supply",
          label: SUPPLY_LABEL,
          icon: PackageSearch,
          to: href.to,
          ...(Object.keys(href.search).length
            ? { search: href.search as Record<string, string> }
            : {}),
          ...(supplyBadges.length ? { badges: supplyBadges } : {}),
          active: (pathname: string, _view: string, pickSection: string) =>
            projectId ? isSupplyPath(pathname) : isSupplySection(pickSection),
        };
      })()
    : null;
  const reports = section("field-reports", "Отчёты", HardHat, "field-reports");
  const catalogs: BottomNavItem = {
    key: "catalogs",
    label: "Справочники",
    icon: BookOpen,
    to: "/catalogs",
    active: (pathname) => pathname === "/catalogs",
  };

  // «Закупки» заменены на «Снабжение» у снабжения, руководителя и директора (ADR-031, п. 5)
  const withSupply = (items: (BottomNavItem | null)[]) =>
    items.filter((item): item is BottomNavItem => item !== null);
  const byRole: Partial<Record<EmployeeRole, BottomNavItem[]>> = {
    foreman: withSupply([today, deliveries, reports]),
    pto: withSupply([check, documents, projects]),
    supply: withSupply([attention, supply, projects]),
    manager: withSupply([attention, projects, supply]),
    director: withSupply([attention, projects, supply]),
  };
  // Роль вне матрицы (finance, worker) видит только реестр: панель не выдумывает ей разделы
  const items = byRole[role] ?? [projects];
  return items.filter((item) => {
    const nav = allNavItems.find((navItem) => navItem.key === (item.navKey ?? item.key));
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
