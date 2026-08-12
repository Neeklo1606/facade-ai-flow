import {
  Bot,
  BookMarked,
  Building2,
  FileSignature,
  FileText,
  GanttChartSquare,
  HardHat,
  History,
  LayoutDashboard,
  Library,
  ListChecks,
  PackageSearch,
  Plug,
  ScrollText,
  Settings,
  TrendingUp,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type BadgeKey = "overdueTasks" | "pendingReports" | "awaitingSuppliers";

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
    title: "Работа",
    items: [
      { to: "/", label: "Дашборд", icon: LayoutDashboard },
      { to: "/objects", label: "Объекты", icon: Building2 },
      { to: "/tasks", label: "Задачи", icon: ListChecks, badge: "overdueTasks" },
      { to: "/reports", label: "Отчеты с объектов", icon: HardHat, badge: "pendingReports" },
      { to: "/schedule", label: "График работ", icon: GanttChartSquare },
    ],
  },
  {
    title: "Документы и снабжение",
    items: [
      { to: "/documents", label: "Документы", icon: FileText },
      { to: "/contracts", label: "Договоры и контроль", icon: FileSignature },
      { to: "/procurement", label: "Заявки и закупки", icon: PackageSearch, badge: "awaitingSuppliers" },
      { to: "/suppliers", label: "Поставщики", icon: Truck },
    ],
  },
  {
    title: "AI",
    items: [
      { to: "/agents", label: "Агенты", icon: Bot },
      { to: "/knowledge", label: "База знаний", icon: Library },
      { to: "/agent-log", label: "Журнал агентов", icon: ScrollText },
    ],
  },
  {
    title: "Управление",
    items: [
      { to: "/analytics", label: "Аналитика", icon: TrendingUp },
      { to: "/catalogs", label: "Справочники", icon: BookMarked },
      { to: "/users", label: "Пользователи и роли", icon: Users },
      { to: "/integrations", label: "Интеграции", icon: Plug },
      { to: "/audit", label: "Журнал действий", icon: History },
      { to: "/settings", label: "Настройки", icon: Settings },
    ],
  },
];

export const routeTitles: Record<string, string> = Object.fromEntries(
  navGroups.flatMap((g) => g.items.map((i) => [i.to, i.label])),
);
