/**
 * Первая неделя на чистой базе: где она останавливается на самом деле.
 * Запуск: node .verify/first-week/clean-db.mjs  (сервер рабочего контура уже поднят на PORT)
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.BASE ?? "http://localhost:4711";
const out = ".verify/first-week";
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
const log = [];
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  log.push(`снимок: ${name}.png — ${page.url()}`);
};

// Шаг 1: корень адреса на чистой базе
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
log.push(`корень адреса привёл на: ${page.url()}`);
await shot("01-koren");

// Шаг 2: попытка войти телефоном руководителя, которого в базе нет
const phone = page.locator('input[type="tel"], input[name="phone"], input[inputmode="tel"]').first();
if (await phone.count()) {
  await phone.fill("+7 921 655-27-84");
  await shot("02-telefon-vveden");
  const submit = page.getByRole("button", { name: /Получить код|Войти|Продолжить/ }).first();
  await submit.click();
  await page.waitForTimeout(2000);
  const text = await page.locator("body").innerText();
  const answer = text.split("\n").filter((line) => /телефон|код|сотрудник|нет/i.test(line));
  log.push(`ответ экрана входа: ${answer.slice(0, 6).join(" | ")}`);
  await shot("03-otvet-vhoda");
} else {
  log.push("поля телефона на экране нет — экран входа выглядит иначе, смотри снимок 01");
}

// Шаг 3: попытка открыть рабочие экраны без входа
for (const path of ["/catalogs", "/users", "/projects"]) {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  log.push(`${path} → ${page.url()}`);
}
await shot("04-bez-vhoda");

console.log(log.join("\n"));
await browser.close();
