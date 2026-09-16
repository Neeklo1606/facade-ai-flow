import {
  Boxes,
  Building2,
  FileText,
  HardHat,
  History,
  PackageSearch,
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
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    title: "Обзор",
    items: [{ key: "projects", label: "Объекты", icon: Building2 }],
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
export function sectionHref(projectId: string | null, section: ProjectSection | undefined) {
  if (!section) return { to: "/projects", search: {} };
  if (!projectId) return { to: "/projects", search: { section } };
  if (section === "suppliers")
    return { to: `/projects/${projectId}/procurement`, search: { view: "suppliers" } };
  return { to: `/projects/${projectId}/${section}`, search: {} };
}

/** Какой пункт меню подсвечивать на текущем адресе. */
export function activeNavKey(pathname: string, view: string, pickSection: string | null) {
  if (pathname === "/projects" && pickSection) return pickSection;
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/?]+))?/);
  if (!match) return pathname.startsWith("/projects") ? "projects" : null;
  const section = match[1];
  if (!section) return "projects";
  if (section === "procurement") return view === "suppliers" ? "suppliers" : "procurement";
  return section;
}
