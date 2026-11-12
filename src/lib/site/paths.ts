/**
 * Адреса публичного сайта (ADR-047, ADR-067): своя оболочка без меню приложения, отрисовка
 * на сервере. Модуль крошечный: его читает корень приложения на каждом экране.
 */
import { demoShow } from "@/api/config";
import { cabinetOnly } from "@/lib/cabinet";

/** Страницы трёх задач клиента (ADR-067), порядок везде одинаковый */
export const TASK_PATHS = [
  "/uchet-vremeni-brigad",
  "/snabzhenie",
  "/ispolnitelnaya-dokumentatsiya",
] as const;

/**
 * Статьи сайта (ADR-068). Адреса списком здесь, а не из текстов: модуль читает корень
 * приложения, тексты статей сюда не едут. tests/site/paths.test.ts сверяет список с текстами
 */
export const ARTICLE_PATHS = [
  "/stati/tabel-brigad-bez-perescheta",
  "/stati/vyrabotka-po-smete-na-chas",
  "/stati/zayavka-na-material-s-obekta",
  "/stati/ispolnitelnaya-dokumentatsiya-iz-dannyh-obekta",
  "/stati/pilot-za-dve-nedeli",
  "/stati/brigadir-i-telefon",
] as const;

/** Новые страницы сайта (ADR-068) */
export const GROWTH_PATHS = ["/dlya-kogo", "/kak-rabotaet", "/stati"] as const;

export const SITE_PATHS = [
  "/",
  ...TASK_PATHS,
  ...GROWTH_PATHS,
  "/demo",
  "/case/gas",
  "/razbor",
  "/kit",
  "/privacy",
] as const;

/**
 * Что открывается поиску при SEO_INDEX=on (ADR-067, раздел 9). /kit, /og, витрина
 * дизайн-системы, приложение и личный контур заказчика закрыты всегда
 */
export const INDEXABLE_PATHS = [
  "/",
  ...TASK_PATHS,
  ...GROWTH_PATHS,
  ...ARTICLE_PATHS,
  "/case/gas",
  "/razbor",
  "/demo",
  "/privacy",
] as const;

/**
 * Первые сегменты адресов приложения и служебных путей. Неизвестный адрес вне этого списка
 * это страница 404 сайта, а не экран приложения. Тест tests/site/paths.test.ts сверяет
 * список с папкой src/routes: новый раздел приложения без строки здесь роняет тест
 */
export const APP_SEGMENTS = new Set([
  "access",
  "agent",
  "analytics",
  "api",
  "app",
  "attention",
  "capture",
  "catalogs",
  "check",
  "contracts",
  "demo-stats",
  "design-system",
  "field",
  "finish",
  "gas",
  "help",
  "inbox",
  "integrations",
  "knowledge",
  "login",
  "more",
  "office",
  "projects",
  "quality",
  "risks",
  "schedule",
  "settings",
  "tasks",
  "templates",
  "today",
  "users",
  "zones",
  // Служебные пути сборки и серверных функций
  "_serverFn",
  "_build",
  "assets",
]);

const normalize = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

/** Первый сегмент адреса: «gas» у /gas/tabel, пусто у корня */
const firstSegment = (path: string) => path.split("/")[1] ?? "";

/** В рабочем контуре (`VITE_DATA_SOURCE=server`) сайта нет: корень ведёт на экран роли */
export function isSitePath(pathname: string): boolean {
  // В кабинете заказчика сайта нет (ADR-062, F6)
  if (!demoShow || cabinetOnly) return false;
  const path = normalize(pathname);
  // /og/<имя>: страницы для снимков превью, только в разработке (ADR-051)
  if ((SITE_PATHS as readonly string[]).includes(path) || path.startsWith("/og/")) return true;
  // Неизвестный адрес вне приложения: страница 404 сайта (ADR-067)
  return !APP_SEGMENTS.has(firstSegment(path));
}

/** Открыт ли адрес поиску: решает и мета-тег, и заголовок x-robots-tag, и robots.txt */
export function isIndexablePath(pathname: string, seoIndex: boolean): boolean {
  if (!seoIndex || !demoShow || cabinetOnly) return false;
  return (INDEXABLE_PATHS as readonly string[]).includes(normalize(pathname));
}
