/**
 * Кто вылезает за ширину окна (ADR-067, раздел 10): элементы, чей правый край дальше окна.
 * bun scripts/site-overflow.ts <адрес> [ширина] [масштаб текста, %]
 */
import { chromium } from "@playwright/test";

const [url, widthArg = "390", scale = "100"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(widthArg), height: 844 } });
await page.addInitScript((value) => {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.style.fontSize = `${value}%`;
  });
}, scale);
await page.goto(url!, { waitUntil: "load" });
const found = await page.evaluate(() => {
  const width = document.documentElement.clientWidth;
  return Array.from(document.querySelectorAll("body *"))
    .map((el) => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ box }) => box.right > width + 0.5 && box.width > 0)
    .slice(0, 12)
    .map(
      ({ el, box }) =>
        `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(box.right)} «${(el.textContent ?? "").trim().slice(0, 40)}»`,
    );
});
console.log(found.join("\n") || "нет");
await browser.close();
