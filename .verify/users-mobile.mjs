/** Уходит ли фокус за край на экране сотрудников (правило обхода, ширины 375–430) */
import { chromium } from "playwright";
const browser = await chromium.launch();
for (const width of [375, 390, 430]) {
  const page = await browser.newPage({ viewport: { width, height: 812 }, locale: "ru-RU" });
  await page.goto("http://localhost:4630/users?persona=e-sokolov", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const bad = await page.evaluate((w) => {
    const out = [];
    for (const el of document.querySelectorAll("button, a, input, select, textarea")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > w + 1 || r.left < -1) out.push(`${el.tagName} «${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40)}»`);
      if (r.height < 44 && r.height > 0 && el.tagName === "BUTTON") out.push(`мелкая цель: ${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)} (${Math.round(r.height)} px)`);
    }
    return out;
  }, width);
  console.log(`${width}px: ${bad.length ? bad.join(" | ") : "за краем и мелких целей нет"}`);
  await page.close();
}
await browser.close();
