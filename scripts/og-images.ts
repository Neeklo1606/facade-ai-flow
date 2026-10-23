/**
 * Картинки превью ссылок (ADR-051, 01_SPEC 11.3): Playwright снимает 1200 x 630 со страниц
 * /og/<имя> сервера разработки и кладёт в public/og/<имя>.jpg. Страницы /og есть только
 * в разработке. Запуск: сервер `bun run dev`, затем `bun scripts/og-images.ts [адрес]`.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/+$/, "");
const NAMES = ["landing", "demo", "case", "razbor"];

mkdirSync("public/og", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  locale: "ru-RU",
  reducedMotion: "reduce",
});
for (const name of NAMES) {
  await page.goto(`${base}/og/${name}`, { waitUntil: "networkidle" });
  const frame = page.locator("[data-og-frame]");
  await frame.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await frame.screenshot({ path: `public/og/${name}.jpg`, type: "jpeg", quality: 86 });
  console.log(`public/og/${name}.jpg`);
}
await browser.close();
