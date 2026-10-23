/**
 * L0, аудит J1: путь холодного ЛПР с телефона так, как он возможен на базе ff93d98.
 * Снимки docs/launch/audit/j1-NN.png (390 x 844, светлая; тёмная только для корня и /gas).
 *
 * Запуск: поднять демо-сборку (`PORT=4640 node .output/server/index.mjs`), затем
 * `J1_BASE=http://localhost:4640 bun docs/launch/audit/j1-walk.ts`
 */
import { chromium, type Page } from "@playwright/test";

const base = process.env["J1_BASE"] ?? "http://localhost:4640";
const out = "docs/launch/audit";
const THEME_KEY = "neeklo-fieldops-theme";

const browser = await chromium.launch({
  ...(process.env["PW_CHROMIUM"] ? { executablePath: process.env["PW_CHROMIUM"] } : {}),
});
const notes: string[] = [];

async function shot(page: Page, n: string, what: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/j1-${n}.png` });
  notes.push(`j1-${n}.png  ${what}  ${page.url().replace(base, "")}`);
}

async function context(theme: "light" | "dark") {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  });
  await ctx.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key!, value!);
      } catch {
        // хранилище недоступно: останется тема по умолчанию
      }
    },
    [THEME_KEY, theme],
  );
  return ctx;
}

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

// Тёмная тема: корень и /gas
{
  const ctx = await context("dark");
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "load" });
  await shot(page, "01", "корень, тёмная тема");
  await page.goto(`${base}/gas`, { waitUntil: "load" });
  await shot(page, "02", "/gas, тёмная тема");
  await ctx.close();
}

// Светлая тема: весь путь
const ctx = await context("light");
const page = await ctx.newPage();
await page.goto(`${base}/`, { waitUntil: "load" });
await shot(page, "03", "корень, светлая тема: что видит человек по ссылке");
const rootText = plain(await page.locator("body").innerText());
notes.push(`корень: ссылка на /gas есть? ${(await page.locator('a[href^="/gas"]').count()) > 0}`);
notes.push(`корень: слово «заявка» есть? ${/заявк/i.test(rootText)}`);
notes.push(`корень: «выработк» есть? ${/выработк/i.test(rootText)}`);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await shot(page, "04", "корень, низ страницы");

await page.goto(`${base}/gas`, { waitUntil: "load" });
await shot(page, "05", "/gas, первый экран");
const gasText = plain(await page.locator("body").innerText());
notes.push(`/gas: «СЛАВЯНСК» в тексте? ${gasText.includes("СЛАВЯНСК")}`);
const startBtn = page.getByRole("button", { name: /Начать показ/ });
const box = await startBtn.boundingBox();
notes.push(`/gas: кнопка показа по y=${box ? Math.round(box.y) : "нет"} из 844`);

// Подсказка «Как работать с экраном»
await page.goto(`${base}/gas/moderation`, { waitUntil: "load" });
await shot(page, "06", "/gas/moderation без показа: подсказка и очередь");
await page.goto(`${base}/gas/reports`, { waitUntil: "load" });
await shot(page, "07", "/gas/reports без показа");
const reportsText = plain(await page.locator("body").innerText());
notes.push(`/gas/reports: «СЛАВЯНСК» в тексте? ${reportsText.includes("СЛАВЯНСК")}`);

// Навигация телефона: бургер / выдвижное меню, «Ещё»
const burger = page.getByRole("button", { name: /Меню|Открыть меню|Навигация/ }).first();
notes.push(
  `/gas/reports: кнопка выдвижного меню видна? ${await burger.isVisible().catch(() => false)}`,
);
const more = page
  .getByRole("button", { name: /^Ещё/ })
  .or(page.getByRole("link", { name: /^Ещё/ }))
  .first();
if (await more.isVisible().catch(() => false)) {
  await more.click();
  await shot(page, "08", "«Ещё» на /gas");
  await page.keyboard.press("Escape");
}

// Показ
await page.goto(`${base}/gas`, { waitUntil: "load" });
await page.getByRole("button", { name: /Начать показ/ }).click();
await page.waitForURL(/\/gas\/foreman/);
await shot(page, "09", "показ шаг 1: бот бригадира");
const bot = page.locator('[data-tour="bot"]');
const answer = (name: string | RegExp) =>
  bot
    .locator("[data-stage]")
    .getByRole("button", typeof name === "string" ? { name, exact: true } : { name })
    .click();
await answer("Внести время");
await answer(/ул\. Демо, 200/);
await answer(/^Сегодня, 03\.10/);
await answer(/^12:00/);
await answer(/^14:30/);
await answer(/^0 мин/);
await shot(page, "10", "показ: сводка в боте перед отправкой");
await answer("Отправить");
await shot(page, "11", "показ шаг 3: запись принята");
const dock = page
  .locator("[data-gas-show-dock], [data-gas-show-inline]")
  .filter({ visible: true })
  .first();
await dock.getByRole("button", { name: /Как менеджер проверки/ }).click();
await page.waitForURL(/\/gas\/moderation/);
await shot(page, "12", "показ: менеджер, карточка записи");
await page.locator('[data-tour="review-confirm"]:visible').first().click();
await shot(page, "13", "показ: подтверждено");
await dock.getByRole("button", { name: /Как руководитель/ }).click();
await page.waitForURL(/\/gas\/reports/);
await shot(page, "14", "показ: строка в отчёте");
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.locator('[data-tour="export"]').click(),
]);
notes.push(`Excel: ${download.suggestedFilename()}`);
await dock.getByRole("button", { name: /Итог показа/ }).click();
await page.waitForURL(/\/gas\/finish/);
await shot(page, "15", "финал показа");
const finishText = plain(await page.locator("main").innerText());
notes.push(
  `финал: есть «заявк»/«разобрать»/«связаться»? ${/заявк|разобрать|связаться|написать/i.test(finishText)}`,
);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await shot(page, "16", "финал, низ");
const links = await page.locator("main a, main button").allInnerTexts();
notes.push(
  `финал: действия: ${links
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" | ")}`,
);

// ГАЙКА без роли
const fresh = await (await context("light")).newPage();
await fresh.goto(`${base}/today`, { waitUntil: "load" });
await shot(fresh, "17", "/today без выбранной роли");
const freshLinks = await fresh.locator('a[href="/"], a[href="/gas"]').count();
notes.push(`/today: ссылок на сайт или /gas: ${freshLinks}`);

// Компьютер
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
const dp = await desk.newPage();
await dp.goto(`${base}/gas`, { waitUntil: "load" });
await dp.waitForTimeout(500);
await dp.screenshot({ path: `${out}/j1-18.png` });
notes.push("j1-18.png  /gas на 1440");

await browser.close();
console.log(notes.join("\n"));
