import {
  BookMarked,
  Boxes,
  Building2,
  FileText,
  GanttChartSquare,
  HardHat,
  History,
  PackageSearch,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type BadgeKey = "unverifiedSpec" | "overdueRequests" | "openChanges";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: BadgeKey;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    title: "Обзор",
    items: [{ to: "/projects", label: "Объекты", icon: Building2 }],
  },
  {
    title: "Работа",
    items: [
      { to: "/documents", label: "Документация", icon: FileText },
      { to: "/materials", label: "Материалы", icon: Boxes, badge: "unverifiedSpec" },
      { to: "/requests", label: "Закупки", icon: PackageSearch, badge: "overdueRequests" },
      { to: "/suppliers", label: "Поставщики", icon: Truck },
    ],
  },
  {
    title: "Площадка",
    items: [
      { to: "/field-reports", label: "Отчёты с площадки", icon: HardHat },
      { to: "/schedule", label: "Ход работ", icon: GanttChartSquare },
    ],
  },
  {
    title: "Управление",
    items: [
      { to: "/audit", label: "История и решения", icon: History },
      { to: "/catalogs", label: "Справочники", icon: BookMarked },
      { to: "/users", label: "Команда", icon: Users },
      { to: "/settings", label: "Настройки", icon: Settings },
    ],
  },
];

export const allNavItems = navGroups.flatMap((g) => g.items);

export function findNavItem(pathname: string) {
  if (pathname === "/") return allNavItems[0];
  return allNavItems.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
}

/** Приоритет мобильной навигации */
export const mobileTabs = ["/projects", "/documents", "/materials", "/requests"] as const;
