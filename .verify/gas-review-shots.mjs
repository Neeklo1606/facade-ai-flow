/**
 * Снимки очереди проверки и деталей (ADR-044, F5): 390 светлая и тёмная, 1440.
 * Запуск: bun .verify/gas-review-shots.mjs [адрес], по умолчанию dev на 5282.
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:5282";
const out = "docs/gas/screenshots/review";
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);

async function session(width, height, theme) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "ru-RU",
    colorScheme: theme,
    deviceScaleFactor: 2,
  });
  await context.addInitScript((mode) => {
    try {
      localStorage.setItem("neeklo-fieldops-theme", mode);
      localStorage.setItem("neeklo-gas-hint-seen", JSON.stringify(["moderation", "entries"]));
    } catch {}
  }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  return { context, page, errors };
}

const ready = async (page) => {
  await page.waitForSelector("[data-queue-card]", { timeout: 60000 });
  await page.waitForTimeout(800);
};

for (const [width, height, theme] of [
  [390, 844, "light"],
  [390, 844, "dark"],
  [1440, 900, "light"],
  [1440, 900, "dark"],
]) {
  const tag = `${width}-${theme}`;
  const { context, page, errors } = await session(width, height, theme);
  await page.goto(`${base}/gas/moderation`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.screenshot({ path: `${out}/queue-${tag}.png`, fullPage: width > 1000 });
  if (width < 1000) {
    await page.locator("[data-queue-card]").first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/details-${tag}.png` });
    await page.locator("[data-review-sheet]").evaluate((el) => el.scrollTo(0, 99999));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/details-bottom-${tag}.png` });
    await page.getByRole("button", { name: "Ещё действия" }).click();
    await page.getByRole("menuitem", { name: "Отклонить" }).click();
    await page.getByRole("button", { name: "Дубль записи" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/reject-${tag}.png` });
  } else {
    await page.getByRole("button", { name: "Ещё действия" }).click();
    await page.getByRole("menuitem", { name: "Отклонить" }).click();
    await page.getByRole("button", { name: "Дубль записи" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/reject-${tag}.png` });
  }
  await page.goto(`${base}/gas/entries`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr, [data-queue-card]", { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/entries-${tag}.png` });
  console.log(tag, errors.length ? errors.join(" | ") : "без ошибок");
  await context.close();
}
await browser.close();
