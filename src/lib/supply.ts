/**
 * Раздел «Снабжение» (ADR-031): одна таблица вкладок на меню, панель, палитру команд и сами
 * экраны. Поправить состав раздела — одна строка здесь.
 *
 * Адреса вкладок — те же экраны, что были отдельными пунктами меню: слияние раздела не
 * переносит адреса (ADR-031, п. 1).
 */
import { Boxes, PackageCheck, PackageSearch, Truck, type LucideIcon } from "lucide-react";
import type { EmployeeRole } from "@/contracts";
import { can, type Section } from "@/domain/access";
import type { BadgeKey, ProjectSection } from "./navigation";

/** Имя раздела: одно на меню, панель, шапку и справку */
export const SUPPLY_LABEL = "Снабжение";

export type SupplyTabId = "spec" | "requests" | "suppliers" | "deliveries";

export interface SupplyTab {
  id: SupplyTabId;
  label: string;
  /** Раздел объекта: из него собирается адрес вкладки (`sectionHref`) */
  section: ProjectSection;
  /** Право раздела (ADR-012): вкладка показывается роли, которой раздел открыт */
  access: Section;
  icon: LucideIcon;
  badge?: BadgeKey;
  /** Что считает бейдж вкладки: читается с экрана вместе с числом */
  badgeLabel?: string;
}

/** Порядок контура: позиция спецификации → запрос → поставщик → поставка */
export const SUPPLY_TABS: SupplyTab[] = [
  {
    id: "spec",
    label: "Спецификация",
    section: "materials",
    access: "materials",
    icon: Boxes,
    badge: "unverifiedSpec",
    badgeLabel: "не проверено",
  },
  {
    id: "requests",
    label: "Запросы",
    section: "procurement",
    access: "procurement",
    icon: PackageSearch,
    badge: "overdueRequests",
    badgeLabel: "просрочено",
  },
  {
    id: "suppliers",
    label: "Поставщики",
    section: "suppliers",
    access: "suppliers",
    icon: Truck,
  },
  {
    id: "deliveries",
    label: "Поставки",
    section: "deliveries",
    access: "deliveries",
    icon: PackageCheck,
    badge: "deliveriesToAccept",
    badgeLabel: "к приёмке",
  },
];

/** Разделы прав, из которых собран «Снабжение»: пункт виден роли, которой открыт хотя бы один */
export const SUPPLY_SECTIONS: Section[] = SUPPLY_TABS.map((tab) => tab.access);

/**
 * Вкладки, доступные роли (ADR-031, п. 2). Права у вкладок разные — один пункт меню их
 * не подменяет, а проверка остаётся на сервере (ADR-012).
 */
export function supplyTabsFor(role: EmployeeRole): SupplyTab[] {
  return SUPPLY_TABS.filter((tab) => can(role, tab.access));
}

/**
 * Дверь раздела по роли (ADR-031, п. 3): вкладка, с которой у роли начинается работа.
 * Таблица, а не «первая доступная»: правило по порядку перенесло бы снабжению и прорабу
 * начало дня на спецификацию.
 */
const doorByRole: Record<EmployeeRole, SupplyTabId> = {
  // Просроченные ответы — счётчик дня снабжения; сегодня «Закупки» ведут туда же
  supply: "requests",
  manager: "requests",
  director: "requests",
  // Единственная вкладка роли
  pto: "requests",
  // Единственная вкладка, где прораб действует: спецификацию он только читает
  foreman: "deliveries",
  // Роли без персон: раздел им закрыт целиком, дверь не понадобится
  finance: "requests",
  worker: "deliveries",
};

export function supplyDoorFor(role: EmployeeRole): SupplyTab | null {
  const tabs = supplyTabsFor(role);
  return tabs.find((tab) => tab.id === doorByRole[role]) ?? tabs[0] ?? null;
}

/**
 * Счётчики вкладок, доступных роли: из них складывается число на пункте «Снабжение»
 * (ADR-031, п. 4). Сумма разложена на полосе вкладок, куда ведёт пункт.
 */
export function supplyBadgesFor(role: EmployeeRole): BadgeKey[] {
  return supplyTabsFor(role).flatMap((tab) => (tab.badge ? [tab.badge] : []));
}

const sectionOfPathname = (pathname: string) =>
  /^\/projects\/[^/]+\/([^/?]+)/.exec(pathname)?.[1] ?? null;

/** Раздел объекта — вкладка снабжения: шапка и просьба выбрать объект берут имя отсюда */
export function isSupplySection(section: string | undefined | null) {
  return SUPPLY_TABS.some((tab) => tab.section === section);
}

/** Адрес из раздела — включая экран сравнения: пункт «Снабжение» на нём подсвечен */
export function isSupplyPath(pathname: string) {
  const section = sectionOfPathname(pathname);
  return section === "materials" || section === "procurement" || section === "deliveries";
}
