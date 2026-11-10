/**
 * Разовая проверка вычисленных стилей (ADR-067, N8): размер шрифта элемента наверху
 * страницы и после прокрутки. bun scripts/site-probe.ts <адрес> <селектор>
 */
import { chromium } from "@playwright/test";

const [url, selector] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url!, { waitUntil: "load" });
const read = () =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const s = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement).fontSize;
    return `${s.fontSize} ${s.fontWeight} html=${root} класс=${el.className.slice(0, 80)}`;
  }, selector!);
console.log("наверху", await read());
await page.evaluate(() => window.scrollTo(0, 2000));
await page.waitForTimeout(500);
console.log("после прокрутки", await read());
await browser.close();
