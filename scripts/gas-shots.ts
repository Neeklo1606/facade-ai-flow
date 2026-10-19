/**
 * Скриншоты раздела учёта времени для отчёта: 1440 и 375 px.
 *
 * Запуск: сначала поднять сервер демо-сборки, затем
 * `GAS_SHOTS_BASE=http://localhost:4630 bun run scripts/gas-shots.ts`
 *
 * Перед сохранением каждый снимок проверяется на персональные данные: если в тексте
 * страницы встретилась фамилия или улица из исходного файла, скрипт падает.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env["GAS_SHOTS_BASE"] ?? "http://localhost:4630";
const out = process.env["GAS_SHOTS_OUT"] ?? "docs/claude/screenshots";

const SCREENS: { path: string; name: string }[] = [
  { path: "/gas", name: "01-svodka" },
  { path: "/gas/foreman", name: "02-brigadir" },
  { path: "/gas/moderation", name: "03-proverka" },
  { path: "/gas/entries", name: "04-zhurnal" },
  { path: "/gas/reports", name: "05-otchet" },
  { path: "/gas/brigades", name: "06-brigady" },
  { path: "/gas/objects", name: "07-obekty" },
  { path: "/gas/estimates", name: "08-stoimost" },
  { path: "/gas/employees", name: "09-sotrudniki" },
  { path: "/gas/admin", name: "10-nastroyka" },
];

/** Что не должно попасть на снимок: фамилии и улицы из исходного файла */
const FORBIDDEN = [
  "Кусей",
  "Малый",
  "Козык",
  "Сыпченко",
  "Баев",
  "Габдумаликов",
  "Залесский",
  "Вырвин",
  "Липка",
  "Супрун",
  "Должиков",
  "Дзержинск",
  "Благодатн",
  "Ветеринарн",
  "Тоннельн",
  "Партизанск",
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env["PW_CHROMIUM"] ? { executablePath: process.env["PW_CHROMIUM"] } : {}),
});

const problems: string[] = [];
const made: string[] = [];

for (const view of [
  { label: "1440", width: 1440, height: 1000 },
  { label: "375", width: 375, height: 812 },
]) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  });
  const page = await context.newPage();
  for (const screen of SCREENS) {
    // domcontentloaded, а не networkidle: на телефоне сеть «не затихает» из-за шрифтов,
    // и ожидание тишины срывало переход
    await page.goto(`${base}${screen.path}`, { waitUntil: "domcontentloaded" });
    await page.locator("main").waitFor();
    await page.waitForLoadState("load");
    await page.waitForTimeout(400);
    const text = await page.locator("body").innerText();
    // Это вообще наш экран? Порт мог занять другой сервер, и снимок ушёл бы от чужого сайта
    if (!text.includes("Газ: учёт времени бригад")) {
      problems.push(`${screen.path} ${view.label}: на странице нет раздела учёта времени`);
    }
    const leaked = FORBIDDEN.filter((word) => text.includes(word));
    if (leaked.length > 0) problems.push(`${screen.path} ${view.label}: ${leaked.join(", ")}`);

    // Переполнение страницы вбок на телефоне: снимок без него не считается
    if (view.width === 375) {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (scrollWidth > 375) problems.push(`${screen.path} 375: прокрутка страницы ${scrollWidth}`);
    }

    const file = `${out}/${screen.name}-${view.label}.png`;
    writeFileSync(file, await page.screenshot({ fullPage: view.width === 1440 }));
    made.push(file);
  }
  await context.close();
}

await browser.close();

for (const file of made) console.log(`снимок: ${file}`);
if (problems.length > 0) {
  console.error("\nПроблемы:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`\nСнимков: ${made.length}, персональных данных на них нет.`);
