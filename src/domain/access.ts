/**
 * Права ролей (ADR-012). Одна таблица на всё: проверка в обёртке портов, меню, кнопки,
 * экран «Нет доступа» и экран матрицы прав. Ячейку меняют здесь — меняется везде.
 */
import type { EmployeeRole } from "@/contracts";

export const SECTIONS = [
  "dashboard",
  "projects",
  "documents",
  "materials",
  "procurement",
  "suppliers",
  "deliveries",
  "field-reports",
  "timeline",
  "agent",
  "analytics",
  "export",
  "access",
] as const;
export type Section = (typeof SECTIONS)[number];

export const sectionLabel: Record<Section, string> = {
  dashboard: "Дашборд",
  projects: "Объекты: реестр, карточка, команда, ход работ",
  documents: "Документы, извлечение, проверка позиций",
  materials: "Материалы",
  procurement: "Закупки: запросы, сравнение, решения",
  suppliers: "Поставщики",
  deliveries: "Поставки и приёмка",
  "field-reports": "Отчёты с площадки",
  timeline: "История и решения",
  agent: "Ассистент",
  analytics: "Аналитика",
  export: "Выгрузки в Excel",
  access: "Права доступа",
};

/** Короткое имя раздела — для экрана «Нет доступа» */
export const sectionShortLabel: Record<Section, string> = {
  dashboard: "Дашборд",
  projects: "Объекты",
  documents: "Документация",
  materials: "Материалы",
  procurement: "Закупки",
  suppliers: "Поставщики",
  deliveries: "Поставки",
  "field-reports": "Отчёты с площадки",
  timeline: "История и решения",
  agent: "Ассистент",
  analytics: "Аналитика",
  export: "Выгрузки",
  access: "Права доступа",
};

export type Level = "none" | "read" | "write";
export type Need = Exclude<Level, "none">;

/** Уровень роли в разделе; own — только объекты, где сотрудник в команде или прораб */
export interface Grant {
  level: Level;
  own: boolean;
}

const g = (level: Level, own = false): Grant => ({ level, own });
const NONE = g("none");
const READ = g("read");
const WRITE = g("write");

const nothing = (): Record<Section, Grant> =>
  Object.fromEntries(SECTIONS.map((section) => [section, NONE])) as Record<Section, Grant>;

export const ACCESS: Record<EmployeeRole, Record<Section, Grant>> = {
  // Все объекты и все действия; удаления объекта в системе нет (ADR-012, п. 1)
  manager: {
    dashboard: READ,
    projects: WRITE,
    documents: WRITE,
    materials: WRITE,
    procurement: WRITE,
    suppliers: WRITE,
    deliveries: WRITE,
    "field-reports": WRITE,
    timeline: READ,
    agent: READ,
    analytics: READ,
    export: READ,
    access: READ,
  },
  supply: {
    ...nothing(),
    projects: READ,
    documents: READ,
    materials: WRITE,
    procurement: WRITE,
    suppliers: WRITE,
    deliveries: WRITE,
  },
  pto: {
    ...nothing(),
    projects: READ,
    documents: WRITE,
    procurement: READ,
    timeline: READ,
  },
  foreman: {
    ...nothing(),
    projects: g("read", true),
    materials: g("read", true),
    "field-reports": g("write", true),
  },
  director: {
    dashboard: READ,
    projects: READ,
    documents: READ,
    materials: READ,
    procurement: READ,
    suppliers: READ,
    deliveries: READ,
    "field-reports": READ,
    timeline: READ,
    agent: READ,
    analytics: READ,
    export: READ,
    access: READ,
  },
  // Персон у этих ролей нет: войти за них в демонстрации нельзя
  finance: { ...nothing(), projects: READ },
  worker: { ...nothing(), projects: g("read", true) },
};

/** Роли в порядке столбцов матрицы: пять ролей экрана выбора (ADR-010) */
export const MATRIX_ROLES: EmployeeRole[] = ["manager", "supply", "pto", "foreman", "director"];

export function grantOf(role: EmployeeRole, section: Section): Grant {
  return ACCESS[role][section];
}

/** Роль видит раздел (need = read) или действует в нём (need = write) */
export function can(role: EmployeeRole, section: Section, need: Need = "read") {
  const { level } = grantOf(role, section);
  return need === "read" ? level !== "none" : level === "write";
}

/** Хоть в одном из разделов роли хватает уровня */
export function canAny(role: EmployeeRole, sections: readonly Section[], need: Need = "read") {
  return sections.some((section) => can(role, section, need));
}

/**
 * Раздел, по которому роль ограничена своими объектами. Правило метода может назвать
 * несколько разделов — область «свои» действует, если во всех подходящих разделах она есть.
 */
export function ownOnly(role: EmployeeRole, sections: readonly Section[], need: Need = "read") {
  const allowed = sections.filter((section) => can(role, section, need));
  return allowed.length > 0 && allowed.every((section) => grantOf(role, section).own);
}

/** Роли, у которых есть доступ к разделу: для объяснения на экране «Нет доступа» */
export function rolesWith(section: Section, need: Need = "read") {
  return MATRIX_ROLES.filter((role) => can(role, section, need));
}

/** Сессия: кто действует, его роль и объекты, если роль ограничена своими */
export interface AccessSession {
  actorId: string;
  role: EmployeeRole;
  /** Объекты сотрудника: в команде объекта или прораб объекта */
  projectIds: string[];
}

/** Объект доступен сессии в разделах правила */
export function canOpenProject(
  session: AccessSession,
  sections: readonly Section[],
  projectId: string,
  need: Need = "read",
) {
  if (!canAny(session.role, sections, need)) return false;
  return !ownOnly(session.role, sections, need) || session.projectIds.includes(projectId);
}

/**
 * Раздел по адресу экрана: для меню, экрана «Нет доступа» и проверки прямого перехода.
 * Поставщики живут вкладкой закупок — `?view=suppliers`.
 */
export function sectionOfPath(pathname: string, view?: string): Section | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "dashboard";
  if (path === "/agent") return "agent";
  if (path === "/analytics") return "analytics";
  if (path === "/access") return "access";
  if (path === "/projects") return "projects";
  const inProject = /^\/projects\/[^/]+(?:\/([^/]+))?/.exec(path);
  if (inProject) {
    const section = inProject[1];
    if (!section) return "projects";
    if (section === "documents") return "documents";
    if (section === "materials") return "materials";
    if (section === "procurement") return view === "suppliers" ? "suppliers" : "procurement";
    if (section === "deliveries") return "deliveries";
    if (section === "field-reports") return "field-reports";
    if (section === "timeline") return "timeline";
    return "projects";
  }
  return null;
}

/** Объект из адреса экрана или null */
export function projectOfPath(pathname: string): string | null {
  return /^\/projects\/([^/]+)/.exec(pathname)?.[1] ?? null;
}
