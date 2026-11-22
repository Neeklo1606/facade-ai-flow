/**
 * Снимки для инструкции бригадиру (docs/customer/foreman.md): телефон 390 px, публичное демо
 * «Демо-подрядчик», светлая тема. Путь: «Сегодня» → «Добавить время» → объект → время →
 * «Проверить» → «Отправить» → «Мои записи».
 *
 * Перед сохранением текст кадра сверяется с данными заказчика: название, населённые пункты
 * и адреса отчёта, имена из отчёта, числа из `.local/real-sums.txt` (если файл есть).
 * Совпадение роняет скрипт, снимок не пишется.
 *
 * Запуск: сервер демо-сборки (`PORT=4644 node .output/server/index.mjs`), затем
 * `bun scripts/customer-shots.ts http://localhost:4644`. Выход: docs/customer/shots/*.png
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { factReport } from "@/data/mock/fact-report";
import { CUSTOMER_BRAND } from "@/server/customer-data";

const base = (process.argv[2] ?? "http://localhost:4644").replace(/\/+$/, "");
const OUT = "docs/customer/shots";
const PHONE = { width: 390, height: 844 };

function forbidden(): string[] {
  const list = new Set<string>([CUSTOMER_BRAND.clientShort]);
  for (const o of factReport.objects) {
    if (o.settlement) list.add(o.settlement);
    if (o.label) list.add(o.label);
  }
  for (const e of factReport.employees as unknown as { name?: string }[]) {
    if (e.name) list.add(e.name);
  }
  const sums = ".local/real-sums.txt";
  if (existsSync(sums)) {
    for (const line of readFileSync(sums, "utf8").split("\n")) {
      const whole = line.trim().split(/[.,]/)[0]?.replace(/\D/g, "") ?? "";
      if (whole.length >= 4) {
        list.add(whole);
        list.add(whole.replace(/\B(?=(\d{3})+(?!\d))/g, " "));
      }
    }
  }
  return [...list].filter((w) => w.length >= 4);
}
const FORBIDDEN = forbidden();
const plain = (t: string) => t.replace(/[\u00a0\u202f]/g, " ");

const HIDE = `
  [data-sonner-toaster], [data-gas-tour], [data-testid="tour-card"], [data-testid="tour-paused"],
  [data-testid="assistant-open"], [data-testid="guide-show"], [data-testid="gas-start-show"],
  [data-gas-show-dock] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; transition: none !important; animation: none !important; }
`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: PHONE,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "ru-RU",
  timezoneId: "Europe/Moscow",
  colorScheme: "light",
  reducedMotion: "reduce",
});
await context.addInitScript(() => {
  try {
    localStorage.setItem("neeklo-fieldops-theme", "light");
    localStorage.setItem(
      "gaika-tour-seen",
      JSON.stringify(["foreman", "manager", "director", "prorab", "supply", "pto", "admin"]),
    );
  } catch {
    // без хранилища снимок будет с подсказкой тура
  }
});
const page: Page = await context.newPage();
page.setDefaultTimeout(30_000);

async function shot(name: string, target?: Locator) {
  const hide = await page.addStyleTag({ content: HIDE });
  try {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(300);
    const text = plain(target ? await target.innerText() : await page.locator("body").innerText());
    const leaked = FORBIDDEN.filter((w) => text.includes(w));
    if (leaked.length) throw new Error(`${name}: на кадре данные заказчика (${leaked.length})`);
    const png = target ? await target.screenshot() : await page.screenshot();
    writeFileSync(`${OUT}/${name}.png`, png);
    console.log(`снимок ${name}`);
  } finally {
    await hide.evaluate((el) => (el as HTMLElement).remove());
  }
}

await page.goto(`${base}/gas`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
await page.getByTestId("gas-role-foreman").click();
await page.waitForURL(/\/gas\/brigade$/);
await page.waitForTimeout(800);
await shot("01-segodnya");

await page.getByRole("button", { name: "Добавить время" }).first().click();
await page
  .getByRole("button", { name: /^Объект/ })
  .first()
  .click();
// Первый объект из графика на сегодня
await page
  .getByRole("dialog")
  .getByRole("button")
  .filter({ hasNotText: /Закрыть|Отмена/ })
  .first()
  .click();
await page.getByRole("textbox", { name: "Время работы" }).fill("8-17");
await shot("03-vremya");
await page.getByRole("button", { name: "Проверить" }).click();
await page.getByText("Проверьте перед отправкой").waitFor();
await shot("04-proverka");
await page.getByRole("button", { name: "Отправить" }).click();
await page.waitForTimeout(1200);
await shot("05-otpravleno");

await browser.close();
