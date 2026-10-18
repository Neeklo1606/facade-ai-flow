/**
 * Модули FieldOps вне трёх сценариев ГАЙКИ (ADR-034, п. 4): документация с извлечением
 * спецификаций, материалы, закупки с поставщиками, поставки.
 *
 * Код не удаляется и не развивается. По умолчанию пункты уходят из навигации, а адреса
 * ведут на рабочий экран роли. Флаг возвращает их целиком: он нужен внедрению у заказчика,
 * который этими модулями уже пользуется, и прогонам проверок — удалять проверки
 * работающего кода нельзя.
 *
 * Флаг не является защитой и ничего не открывает сверх прав: права проверяются на сервере
 * (ADR-012), скрытый пункт меню защитой не является.
 */
import type { ProjectSection } from "./navigation";

/** Ключ прогонов проверок: ставится так же, как персона и тема */
export const LEGACY_KEY = "neeklo-fieldops-legacy";

/** Разделы объекта за флагом */
export const LEGACY_SECTIONS = [
  "documents",
  "materials",
  "procurement",
  "suppliers",
  "deliveries",
] as const satisfies readonly ProjectSection[];

export type LegacySection = (typeof LEGACY_SECTIONS)[number];

const legacySet = new Set<string>(LEGACY_SECTIONS);

export const isLegacySection = (section: string | null | undefined) =>
  !!section && legacySet.has(section);

/**
 * Страницы-обещания прежнего контура: разделов с такими адресами в ГАЙКЕ не будет
 * (ADR-034, п. 5). `/tasks` и `/risks` сюда не входят: их занимают сценарии 2 и 3.
 */
export const RETIRED_PATHS = [
  "/analytics",
  "/contracts",
  "/knowledge",
  "/quality",
  "/schedule",
  "/settings",
  "/templates",
  "/zones",
] as const;

const retiredSet = new Set<string>(RETIRED_PATHS);

export const isRetiredPath = (pathname: string) => retiredSet.has(pathname.replace(/\/$/u, ""));

/**
 * Экраны вне канона демо 18.10 (ADR-038, ADR-041): ассистент, сотрудники и права, история
 * решений. Код и проверки остаются; без флага пункты уходят из полевого меню, адреса ведут
 * на рабочий экран роли. Сотрудники и права вернутся разделом кабинета компании (ADR-039).
 */
export const OUTSIDE_CANON_PATHS = ["/agent", "/users", "/access"] as const;

const outsideSet = new Set<string>(OUTSIDE_CANON_PATHS);

export const isOutsideCanonPath = (pathname: string) =>
  outsideSet.has(pathname.replace(/\/$/u, "")) || /^\/projects\/[^/]+\/timeline/u.test(pathname);

/** Включён ли флаг в этой вкладке: переменная сборки или ключ прогона проверок */
export function legacyModulesEnabled() {
  if (import.meta.env["VITE_LEGACY_MODULES"] === "1") return true;
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(LEGACY_KEY) === "1";
  } catch {
    // Приватный режим: флага нет, модули скрыты
    return false;
  }
}

/** Ведёт ли адрес в модуль за флагом: разделы объекта плюс карточка документа и запроса */
export function isLegacyPath(pathname: string, view?: string) {
  if (isOutsideCanonPath(pathname)) return true;
  const inProject = /^\/projects\/[^/]+\/([^/]+)/u.exec(pathname);
  const section = inProject?.[1];
  if (!section) return false;
  if (section === "procurement" && view === "suppliers") return true;
  return isLegacySection(section);
}
