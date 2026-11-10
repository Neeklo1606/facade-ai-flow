/**
 * Кадры экрана страницы сайта для проверки глазами (ADR-067, N8): по одному кадру на
 * высоту окна сверху вниз, без склейки в длинный снимок.
 *
 * bun scripts/site-look.ts <адрес страницы> <ширина> <папка> [кадров] [тема light|dark]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [url, widthArg, out, framesArg, theme = "light"] = process.argv.slice(2);
if (!url || !widthArg || !out) throw new Error("адрес, ширина и папка обязательны");
const width = Number(widthArg);
const height = width < 768 ? 844 : 900;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  locale: "ru-RU",
  colorScheme: theme === "dark" ? "dark" : "light",
  hasTouch: width < 768,
});
if (theme === "dark")
  await context.addInitScript(() => localStorage.setItem("neeklo-fieldops-theme", "dark"));
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1600);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const frames = Math.min(Number(framesArg ?? 99), Math.ceil(total / height));
for (let i = 0; i < frames; i += 1) {
  await page.evaluate((y) => window.scrollTo(0, y), i * height);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${width}-${String(i).padStart(2, "0")}.png` });
}
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
console.log(JSON.stringify({ total, frames, overflow, errors }));
await browser.close();
