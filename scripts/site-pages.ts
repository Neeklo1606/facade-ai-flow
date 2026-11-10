/**
 * Снимки страниц сайта целиком на 390 и 1440 (GAIKA_SITE_V2, разделы 12 и 13): «до» в N0
 * и «после» в N8. Сервер демо-сборки должен быть запущен.
 *
 * bun scripts/site-pages.ts <папка> [адрес] [пути через запятую]
 * пример: bun scripts/site-pages.ts docs/site/after http://localhost:4630
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "docs/site/after";
const base = (process.argv[3] ?? "http://localhost:4630").replace(/\/+$/, "");
const DEFAULT = [
  "/",
  "/uchet-vremeni-brigad",
  "/snabzhenie",
  "/ispolnitelnaya-dokumentatsiya",
  "/case/gas",
  "/razbor",
  "/demo",
  "/privacy",
  "/kit",
  "/net-takoy-stranicy",
];
const paths = process.argv[4] ? process.argv[4].split(",") : DEFAULT;

const name = (path: string) => (path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "-"));

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const width of [390, 1440]) {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: "ru-RU",
    colorScheme: "light",
    hasTouch: width < 768,
  });
  const page = await context.newPage();
  for (const path of paths) {
    const response = await page.goto(base + path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // Блоки появляются при прокрутке: прокрутить до конца, чтобы снимок был как у человека
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    const file = `${out}/${name(path)}-${width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${response?.status() ?? "-"} ${file}`);
  }
  await context.close();
}
await browser.close();
