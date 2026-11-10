/**
 * robots.txt и sitemap.xml сайта (ADR-067, раздел 9). Отвечает сервер, а не статичный файл:
 * без SEO_INDEX=on закрыто всё, как раньше; с ним открыты публичные страницы, приложение
 * и служебные адреса закрыты, в конце строка `Sitemap:`.
 */
import { BUILD_DATE, PUBLIC_URL } from "./config";
import { INDEXABLE_PATHS } from "./paths";

/** Закрыто всегда: приложение, кабинет, служебные адреса (раздел 9.1) */
export const ROBOTS_CLOSED = [
  "/kit",
  "/og/",
  "/design-system",
  "/api/",
  "/gas",
  "/office",
  "/app",
  "/login",
  "/_serverFn/",
] as const;

export const ROBOTS_ASSETS = [
  "/assets/",
  "/fonts/",
  "/site/",
  "/og/*.jpg$",
  "/og-preview.jpg",
  "/favicon.ico",
  "/icon-",
  "/manifest.webmanifest",
] as const;

export function robotsTxt(seoIndex: boolean): string {
  if (!seoIndex) {
    return [
      "# Сайт закрыт от индексации: SEO_INDEX не включён в окружении хостинга (ADR-067).",
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n");
  }
  return [
    "User-agent: *",
    ...INDEXABLE_PATHS.map((path) => `Allow: ${path === "/" ? "/$" : path}`),
    // Стили, скрипты, шрифты и картинки: без них поисковик не отрисует страницу
    ...ROBOTS_ASSETS.map((path) => `Allow: ${path}`),
    ...ROBOTS_CLOSED.map((path) => `Disallow: ${path}`),
    // Остальные адреса приложения ГАЙКИ: открыт только перечисленный выше сайт
    "Disallow: /",
    "",
    `Sitemap: ${PUBLIC_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sitemapXml(): string {
  const urls = INDEXABLE_PATHS.map((path) => {
    const loc = escapeXml(PUBLIC_URL + (path === "/" ? "/" : path));
    return `  <url><loc>${loc}</loc><lastmod>${BUILD_DATE}</lastmod></url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
