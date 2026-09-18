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
      { key: "dashboard", label: "Дашборд", icon: LayoutDashboard, to: "/" },
      { key: "projects", label: "Объекты", icon: Building2 },
      { key: "agent", label: "Ассистент", icon: Sparkles, to: "/agent" },
    ],
  },
  {
    title: "Работа",
    items: [
      { key: "documents", label: "Документация", icon: FileText, section: "documents" },
      {
        key: "materials",
        label: "Материалы",
        icon: Boxes,
        badge: "unverifiedSpec",
        section: "materials",
      },
      {
        key: "procurement",
        label: "Закупки",
        icon: PackageSearch,
        badge: "overdueRequests",
        section: "procurement",
      },
      { key: "suppliers", label: "Поставщики", icon: Truck, section: "suppliers" },
    ],
  },
  {
    title: "Площадка",
    items: [
      { key: "field-reports", label: "Отчёты с площадки", icon: HardHat, section: "field-reports" },
    ],
  },
  {
    title: "Управление",
    items: [{ key: "timeline", label: "История и решения", icon: History, section: "timeline" }],
  },
];

export const allNavItems = navGroups.flatMap((g) => g.items);

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
