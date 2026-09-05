import {
  AlertTriangle,
  BookMarked,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  FileStack,
  FileText,
  GanttChartSquare,
  HardHat,
  History,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Library,
  ListChecks,
  PackageCheck,
  PackageSearch,
  Plug,
  ScrollText,
  Settings,
  Target,
  TrendingUp,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type BadgeKey = "criticalRisks" | "inboxUnprocessed" | "pendingReview" | "overdueTasks" | "requestsNoReply";

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
    items: [
      { to: "/", label: "Дашборд", icon: LayoutDashboard },
      { to: "/risks", label: "Риски и отклонения", icon: AlertTriangle, badge: "criticalRisks" },
    ],
  },
  {
    title: "Поток данных",
    items: [
      { to: "/inbox", label: "Входящие", icon: Inbox, badge: "inboxUnprocessed" },
      { to: "/verification", label: "Проверка данных", icon: CheckCircle2, badge: "pendingReview" },
      { to: "/field-reports", label: "Отчёты с площадки", icon: HardHat },
    ],
  },
  {
    title: "Объекты",
    items: [
      { to: "/sites", label: "Объекты", icon: Building2 },
      { to: "/zones", label: "Захватки и объёмы", icon: LayoutGrid },
      { to: "/schedule", label: "График работ", icon: GanttChartSquare },
      { to: "/tasks", label: "Задачи и замечания", icon: ListChecks, badge: "overdueTasks" },
    ],
  },
  {
    title: "Снабжение",
    items: [
      { to: "/requests", label: "Заявки", icon: PackageSearch, badge: "requestsNoReply" },
      { to: "/quotes", label: "Предложения поставщиков", icon: ClipboardList },
      { to: "/suppliers", label: "Поставщики", icon: Truck },
      { to: "/deliveries", label: "Поставки", icon: PackageCheck },
    ],
  },
  {
    title: "Документы",
    items: [
      { to: "/documents", label: "Реестр документов", icon: FileText },
      { to: "/contracts", label: "Договоры и обязательства", icon: FileSignature },
      { to: "/templates", label: "Шаблоны", icon: FileStack },
    ],
  },
  {
    title: "AI",
    items: [
      { to: "/agents", label: "Агенты", icon: Bot },
      { to: "/agent-log", label: "Журнал агентов", icon: ScrollText },
      { to: "/knowledge", label: "База знаний", icon: Library },
      { to: "/quality", label: "Качество извлечения", icon: Target },
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

export const allNavItems = navGroups.flatMap((g) => g.items);

export function findNavItem(pathname: string) {
  if (pathname === "/") return allNavItems[0];
  return allNavItems.find((i) => i.to !== "/" && (pathname === i.to || pathname.startsWith(`${i.to}/`)));
}

/** Приоритет мобильной навигации */
export const mobileTabs = ["/", "/inbox", "/verification", "/risks"] as const;
