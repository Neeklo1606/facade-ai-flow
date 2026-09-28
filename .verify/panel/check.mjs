/**
 * Панель на трёх ширинах для четырёх ролей (ADR-026, VERIFY): состав, оранжевое пятно,
 * активная позиция, переполнение, цели нажатия, поведение при фокусе в поле ввода.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.BASE ?? "http://localhost:4630";
const out = ".verify/panel";
await mkdir(out, { recursive: true });

const roles = [
  ["e-sokolov", "руководитель"],
  ["e-dorohov", "снабжение"],
  ["e-volkova", "пто"],
  ["e-gareev", "прораб"],
];
const widths = [375, 390, 430];
const browser = await chromium.launch();
const log = [];
const say = (line) => { log.push(line); console.log(line); };

for (const [persona, title] of roles) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 812 }, locale: "ru-RU" });
    await page.addInitScript((id) => {
      sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
      sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
      sessionStorage.setItem("neeklo-fieldops-persona", id);
    }, persona);
    await page.goto(`${base}/projects/p-korona`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    const panel = page.locator('nav[aria-label="Основная навигация"]');
    const data = await panel.evaluate((nav) => {
      const isOrange = (color) => {
        const m = color.match(/rgba?\(([^)]+)\)/);
        if (!m) return false;
        const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        if (a < 0.1) return false;
        const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
        const l = (max + min) / 2, d = max - min;
        if (d === 0) return false;
        const s = d / (1 - Math.abs(2 * l - 1));
        const R = r / 255, G = g / 255, B = b / 255;
        let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
        h = (h * 60 + 360) % 360;
        return s > 0.6 && h >= 8 && h <= 34 && l > 0.2 && l < 0.65;
      };
      const orange = [];
      const small = [];
      for (const el of nav.querySelectorAll("*")) {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (isOrange(style.backgroundColor) || isOrange(style.color)) {
          orange.push(`${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20)}»`);
        }
        if ((el.tagName === "A" || el.tagName === "BUTTON") && (rect.height < 48 || rect.width < 40)) {
          small.push(`${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20)}: ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        }
      }
      const cells = [...nav.children].map((child) => {
        const link = child.tagName === "A" || child.tagName === "BUTTON" ? child : child.querySelector("a,button");
        return (link?.getAttribute("aria-label") || link?.textContent || child.textContent || "").trim().slice(0, 24);
      });
      const active = nav.querySelector('[aria-current="page"]');
      const activeColor = active ? getComputedStyle(active).color : null;
      const rect = nav.getBoundingClientRect();
      return { cells, orange, small, activeLabel: active?.textContent?.trim() ?? null, activeOrange: activeColor ? isOrange(activeColor) : null, height: Math.round(rect.height) };
    });
    const overflow = await page.evaluate((w) => document.documentElement.scrollWidth > w + 1, width);
    say(`${title} ${width}: [${data.cells.join(" | ")}] высота ${data.height} оранжевых ${data.orange.length} (${data.orange.join(", ")}) активная «${data.activeLabel}» оранжевая:${data.activeOrange} мелких ${data.small.length} ${data.small.join("; ")} переполнение:${overflow}`);
    if (width === 375) await page.screenshot({ path: `${out}/${title}-375.png` });
    await page.close();
  }
}

// Клавиатура: фокус в поле ввода убирает панель
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, locale: "ru-RU" });
await page.addInitScript(() => {
  sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
  sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
  sessionStorage.setItem("neeklo-fieldops-persona", "e-dorohov");
});
await page.goto(`${base}/catalogs`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const panel = page.locator('nav[aria-label="Основная навигация"]');
const before = await panel.evaluate((n) => getComputedStyle(n).opacity);
await page.evaluate(() => {
  const field = document.querySelector('input[type="text"], input:not([type])');
  if (field instanceof HTMLElement) field.focus();
});
await page.waitForTimeout(600);
const after = await panel.evaluate((n) => ({ opacity: getComputedStyle(n).opacity, keyboard: n.dataset.keyboard ?? null }));
say(`клавиатура: до фокуса прозрачность ${before}, после ${after.opacity}, метка ${after.keyboard}`);
await page.screenshot({ path: `${out}/klaviatura-375.png` });

// Шторка «+»: открывается, закрывается Esc, фокус возвращается
await page.evaluate(() => { const el = document.activeElement; if (el instanceof HTMLElement) el.blur(); });
await page.waitForTimeout(500);
const plus = page.getByRole("button", { name: "Создать" });
if (await plus.count()) {
  await plus.click();
  await page.waitForTimeout(700);
  const sheet = page.getByRole("dialog");
  const items = await sheet.getByRole("button").allInnerTexts();
  say(`шторка «+»: ${items.map((t) => t.split("\n")[0]).filter(Boolean).join(" | ")}`);
  await page.screenshot({ path: `${out}/plus-375.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null);
  say(`после Esc шторка закрыта:${(await sheet.count()) === 0} фокус на «${focused}»`);
} else {
  say("шторка «+»: кнопки нет");
}
await browser.close();
console.log("--- итого строк:", log.length);
