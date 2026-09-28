/** Шторка: Esc закрывает, перетаскивание вниз закрывает, фокус возвращается (ADR-026, п. 9) */
import { chromium } from "playwright";
const base = "http://localhost:4630";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
await page.addInitScript(() => {
  sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
  sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
  sessionStorage.setItem("neeklo-fieldops-persona", "e-dorohov");
});
await page.goto(`${base}/projects/p-korona/procurement`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);

const sheet = () => page.locator('[role="dialog"][data-state="open"]');
const plus = page.locator('[data-tour="nav-plus"]');
console.log("адрес:", page.url(), "кнопок «Создать»:", await plus.count());
console.log("панель:", await page.locator('nav[aria-label="Основная навигация"]').count());
await plus.click();
await page.waitForTimeout(600);
console.log("открылась:", await sheet().count());
await page.keyboard.press("Escape");
await page.waitForTimeout(900);
console.log("после Esc открытых шторок:", await sheet().count());
const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null);
console.log("фокус вернулся на:", focused);

// Активная позиция на своём экране роли
const active = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Основная навигация"]');
  const el = nav?.querySelector('[aria-current="page"]');
  if (!el) return null;
  const style = getComputedStyle(el);
  const indicator = el.querySelector("span[aria-hidden]");
  return {
    label: el.textContent?.trim().slice(0, 20) ?? null,
    color: style.color,
    indicatorHeight: indicator ? getComputedStyle(indicator).height : null,
    indicatorColor: indicator ? getComputedStyle(indicator).backgroundColor : null,
  };
});
console.log("активная позиция:", JSON.stringify(active));

// Перетаскивание вниз закрывает
await plus.click();
await page.waitForTimeout(600);
const box = await sheet().boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 320, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
}
console.log("после перетаскивания открытых шторок:", await sheet().count());
await page.screenshot({ path: ".verify/panel/sheet-390.png" });
await browser.close();
