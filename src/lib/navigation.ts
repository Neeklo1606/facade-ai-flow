import type { EmployeeRole } from "@/contracts";
import { can, type Section } from "@/domain/access";
import { isLegacySection, isOutsideCanonPath, legacyModulesEnabled } from "./legacy-modules";
import {
  Users,
  BookOpen,
  Boxes,
  Building2,
  FileText,
  HardHat,
  History,
  Inbox,
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
      /*
       * «Входящие» (ADR-034, п. 3): то, что ждёт этого человека — возвраты автору, очередь
       * проверки и решения. Права раздела те же, что у фактов площадки: экран собирается
       * из них и из «Обзора», а блок без права просто не показывается.
       */
      {
        key: "inbox",
        label: "Входящие",
        icon: Inbox,
        to: "/inbox",
        /*
         * Как и «Обзор», это не раздел прав, а сборка: возвраты и очередь проверки стоят
         * на фактах площадки, решения — на закупках и истории. Роли видно то, на что у неё
         * есть право, остальные блоки экран не рисует (ADR-028, ADR-034, п. 3).
         */
        anyOf: ["field-reports", "procurement", "timeline"],
      },
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

/**
 * Видит ли роль этот пункт меню: по матрице прав (ADR-012) и по флагу `legacy_modules`
 * (ADR-034, п. 4). Модули прежнего контура уходят из навигации целиком, независимо от роли:
 * они не входят в три сценария ГАЙКИ.
 */
export function visibleFor(item: NavItem, role: EmployeeRole) {
  if (isLegacySection(item.section) && !legacyModulesEnabled()) return false;
  // Вне канона демо: ассистент, сотрудники, права, история решений (ADR-041)
  if (
    !legacyModulesEnabled() &&
    ((item.to && isOutsideCanonPath(item.to)) || item.section === "timeline")
  ) {
    return false;
  }
  if (item.roles && !item.roles.includes(role)) return false;
  if (item.anyOf) return item.anyOf.some((section) => can(role, section));
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
  /*
   * Снабжение в каноне демо работает с заявками на материал — они во «Входящих» (ADR-038,
   * сценарий 3). «Обзор» прежнего контура считал закупки и остаётся за флагом (ADR-041).
   */
  if (role === "supply" && !legacyModulesEnabled()) return "/inbox";
  if (can(role, "procurement") || can(role, "documents")) return "/attention";
  return "/projects";
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
  if (pathname === "/attention") return "attention";
  if (pathname === "/today") return "today";
  if (pathname === "/check") return "check";
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
 * Набор позиций панели (ADR-034, п. 1; раздел 6 GAIKA_PRODUCT_UX). Пять позиций одинаковы
 * для всех ролей: рабочий экран роли, объект, центральная кнопка записи, входящие, ещё.
 * Центральную кнопку и «Ещё» рисует сама панель, поэтому здесь три позиции.
 *
 * Меняется только первая: прорабу «Сегодня», проверяющему «Проверка», руководителю
 * и снабжению «Обзор». Подпись равна названию экрана, на который позиция ведёт, иначе
 * проверяющий нажимал бы «Сегодня» и попадал на «Проверку» (ADR-028).
 *
 * Модулей прежнего контура в панели нет: они за флагом `legacy_modules` (ADR-034, п. 4).
 */
export function bottomNavFor(role: EmployeeRole, projectId: string | null): BottomNavItem[] {
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
  const inbox: BottomNavItem = {
    key: "inbox",
    label: "Входящие",
    icon: Inbox,
    to: "/inbox",
    active: (pathname) => pathname === "/inbox",
  };

  /** Рабочий экран роли первой позицией: панель начинается там же, где начинается день */
  const homes: Record<string, BottomNavItem> = {
    "/today": today,
    "/check": check,
    "/attention": attention,
    "/inbox": inbox,
  };
  const home = homes[homeRouteFor(role)] ?? projects;

  /*
   * Роли вне матрицы (worker, finance) работают только с реестром: у них рабочий экран и есть
   * «Объекты», и вторая такая же позиция была бы кнопкой в ту же дверь.
   */
  const items = [home, projects, inbox].filter(
    (item, index, list) => list.findIndex((other) => other.key === item.key) === index,
  );
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
  const actions = byRole[role] ?? [];
  if (legacyModulesEnabled()) return actions;
  /*
   * Действия модулей за флагом уходят вместе с модулями (ADR-034, п. 4): шторка не ведёт
   * на экран, который сейчас перенаправляет на рабочий экран роли.
   */
  return actions.filter((action) => !LEGACY_ACTIONS.has(action.key));
}

/**
 * Действия шторки, которые живут в модулях прежнего контура. Номенклатуры и материала здесь
 * нет: они ведут в справочники, а справочники остаются — это контекст объекта для шлюза (G3).
 */
const LEGACY_ACTIONS = new Set(["document", "request", "supplier", "acceptance"]);
