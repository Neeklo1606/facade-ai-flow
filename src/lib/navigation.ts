import {
  Bot,
  Building2,
  FileSignature,
  FileText,
  GanttChartSquare,
  HardHat,
  LayoutDashboard,
  ListChecks,
  Mail,
  PackageSearch,
  Plug,
  ScrollText,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { DemoRole } from "./auth-context";

export type BadgeKey = "overdueTasks" | "pendingReports" | "awaitingSuppliers";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: BadgeKey;
  /** роли, которым доступен раздел */
  roles: DemoRole[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ALL: DemoRole[] = ["pm", "foreman"];
const PM: DemoRole[] = ["pm"];

export const navGroups: NavGroup[] = [
  {
    title: "Работа",
    items: [
      { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard, roles: ALL },
      { to: "/objects", label: "Объекты", icon: Building2, roles: PM },
      { to: "/tasks", label: "Задачи", icon: ListChecks, badge: "overdueTasks", roles: ALL },
      { to: "/reports", label: "Отчёты с объектов", icon: HardHat, badge: "pendingReports", roles: ALL },
      { to: "/schedule", label: "График работ", icon: GanttChartSquare, roles: ALL },
    ],
  },
  {
    title: "Документы и снабжение",
    items: [
      { to: "/documents", label: "Документы", icon: FileText, roles: ALL },
      { to: "/contracts", label: "Договоры и контроль", icon: FileSignature, roles: PM },
      { to: "/procurement", label: "Заявки и закупки", icon: PackageSearch, badge: "awaitingSuppliers", roles: PM },
      { to: "/suppliers", label: "Поставщики", icon: Truck, roles: PM },
      { to: "/mailings", label: "Рассылки заказчикам", icon: Mail, roles: PM },
    ],
  },
  {
    title: "AI",
    items: [
      { to: "/agents", label: "Агенты", icon: Bot, roles: PM },
      { to: "/agent-log", label: "Журнал агентов", icon: ScrollText, roles: PM },
    ],
  },
  {
    title: "Управление",
    items: [
      { to: "/users", label: "Пользователи и роли", icon: Users, roles: PM },
      { to: "/integrations", label: "Интеграции", icon: Plug, roles: PM },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

export function navGroupsForRole(role: DemoRole): NavGroup[] {
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
}

export function findNavItem(pathname: string): NavItem | undefined {
  return allNavItems.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
}

export function canAccess(role: DemoRole, pathname: string): boolean {
  const item = findNavItem(pathname);
  if (!item) return true;
  return item.roles.includes(role);
}

export const routeTitles: Record<string, string> = Object.fromEntries(
  allNavItems.map((i) => [i.to, i.label]),
);

/** Нижняя таб-панель на мобильных */
export const mobileTabs = ["/dashboard", "/objects", "/tasks", "/reports"] as const;
