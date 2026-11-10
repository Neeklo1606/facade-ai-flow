import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "./fixtures";

/**
 * SEO при SEO_INDEX=on (ADR-067, раздел 9): второй сервер той же сборки с переменной.
 * Без переменной всё закрыто, это проверяет e2e/site.spec.ts.
 */
const port = 4672;
const base = `http://localhost:${port}`;
const OPEN = [
  "/",
  "/uchet-vremeni-brigad",
  "/snabzhenie",
  "/ispolnitelnaya-dokumentatsiya",
  "/case/gas",
  "/razbor",
  "/demo",
  "/privacy",
];
let app: ChildProcess;

test.beforeAll(async () => {
  app = spawn("node", [".output/server/index.mjs"], {
    env: { ...process.env, PORT: String(port), SEO_INDEX: "on" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i += 1) {
    const ok = await fetch(`${base}/privacy`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("сервер с SEO_INDEX=on не поднялся");
});

test.afterAll(() => {
  app?.kill();
});

test("robots.txt открывает публичные страницы, закрывает приложение, ведёт на sitemap", async ({
  request,
}) => {
  const text = await (await request.get(`${base}/robots.txt`)).text();
  expect(text).toContain("Allow: /$");
  for (const path of OPEN.slice(1)) expect(text).toContain(`Allow: ${path}\n`);
  for (const path of ["/kit", "/og/", "/design-system", "/gas", "/office"])
    expect(text).toContain(`Disallow: ${path}\n`);
  expect(text).toMatch(/\nSitemap: https?:\/\/\S+\/sitemap\.xml\n/);
});

test("sitemap.xml: публичные страницы абсолютными адресами и дата сборки", async ({ request }) => {
  const response = await request.get(`${base}/sitemap.xml`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/xml");
  const xml = await response.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs).toEqual(OPEN);
  expect(xml).toMatch(/<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/);
  expect(xml).not.toContain("/kit");
});

test("мета robots и x-robots-tag: публичные открыты, /kit и приложение закрыты", async ({
  request,
}) => {
  for (const path of OPEN) {
    const response = await request.get(`${base}${path}`);
    const html = await response.text();
    expect(html, path).toContain('name="robots" content="index, follow"');
    expect(response.headers()["x-robots-tag"], path).toBeUndefined();
    expect(html, path).toMatch(/<html lang="ru"/);
    expect(html, path).toMatch(/<title>[^<]{10,60}<\/title>/);
    const description = html.match(/name="description" content="([^"]+)"/)![1]!;
    expect(description.length, `${path} description`).toBeGreaterThanOrEqual(120);
    expect(description.length, `${path} description`).toBeLessThanOrEqual(160);
  }
  for (const path of ["/kit", "/gas", "/office"]) {
    const response = await request.get(`${base}${path}`);
    expect(response.headers()["x-robots-tag"], path).toContain("noindex");
  }
  expect(await (await request.get(`${base}/kit`)).text()).toContain(
    'name="robots" content="noindex, nofollow"',
  );
});

test("после загрузки скриптов мета robots остаётся index", async ({ page }) => {
  await page.goto(`${base}/uchet-vremeni-brigad`, { waitUntil: "load" });
  await page.waitForSelector("html[data-booted]");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
});
