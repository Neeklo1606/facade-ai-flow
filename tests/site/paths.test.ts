import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { APP_SEGMENTS, INDEXABLE_PATHS, SITE_PATHS, TASK_PATHS } from "@/lib/site/paths";
import { robotsTxt, sitemapXml } from "@/lib/site/seo";

/**
 * Адреса сайта и правило индексации (ADR-067). Страница 404 сайта рисуется для адресов,
 * первый сегмент которых не принадлежит приложению: список APP_SEGMENTS обязан покрывать
 * каждый раздел src/routes, иначе неизвестный экран приложения стал бы страницей сайта.
 */
const SITE_SEGMENTS = new Set([
  "",
  "index",
  "demo",
  "case",
  "razbor",
  "kit",
  "privacy",
  "og",
  "uchet-vremeni-brigad",
  "snabzhenie",
  "ispolnitelnaya-dokumentatsiya",
  "robots[",
  "sitemap[",
  "__root",
  "README",
]);

describe("адреса сайта", () => {
  test("каждый раздел src/routes либо сайт, либо в APP_SEGMENTS", () => {
    const segments = readdirSync("src/routes").map(
      (name) =>
        name
          .replace(/\.(tsx?|md)$/, "")
          .replace(/\.lazy$/, "")
          .split(".")[0]!,
    );
    const missing = segments.filter((name) => !SITE_SEGMENTS.has(name) && !APP_SEGMENTS.has(name));
    expect(missing).toEqual([]);
  });

  test("страницы задач в сайте и в индексе, /kit никогда", () => {
    for (const path of TASK_PATHS) {
      expect(SITE_PATHS).toContain(path);
      expect(INDEXABLE_PATHS).toContain(path);
    }
    expect(INDEXABLE_PATHS).not.toContain("/kit" as never);
  });

  test("robots.txt: без SEO_INDEX закрыто всё, с ним публичное открыто и есть Sitemap", () => {
    expect(robotsTxt(false)).toContain("User-agent: *\nDisallow: /\n");
    expect(robotsTxt(false)).not.toContain("Sitemap:");
    const open = robotsTxt(true);
    for (const path of TASK_PATHS) expect(open).toContain(`Allow: ${path}\n`);
    expect(open).toContain("Disallow: /kit\n");
    expect(open).toContain("Disallow: /gas\n");
    expect(open).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
  });

  test("sitemap.xml: все публичные страницы абсолютными адресами", () => {
    const xml = sitemapXml();
    for (const path of INDEXABLE_PATHS)
      expect(xml).toMatch(new RegExp(`<loc>https?://[^<]+${path === "/" ? "/" : path}</loc>`));
    expect(xml).not.toContain("/kit");
  });
});
