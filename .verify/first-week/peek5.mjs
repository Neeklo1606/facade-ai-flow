import { chromium } from "playwright";
import { loginByPhone } from "./login.mjs";
const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
await loginByPhone(page, new URL(url).origin, "+79216552784");
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Создать запрос поставщикам/ }).first().click();
await page.waitForTimeout(1000);
const dialog = () => page.getByRole("dialog").first();
const buttons = async (tag) => {
  const list = [];
  for (const b of await dialog().getByRole("button").all()) {
    const t = (await b.innerText().catch(() => "")).replace(/\n/g, " ").trim();
    const disabled = await b.isDisabled().catch(() => false);
    if (t) list.push(`${t}${disabled ? " [неактивна]" : ""}`);
  }
  console.log(tag, "→", list.join(" | "));
};
await buttons("шаг 1");
await dialog().getByRole("button", { name: /Далее: Поставщики/ }).click();
await page.waitForTimeout(800);
const box = dialog().getByRole("checkbox");
console.log("чекбоксов поставщиков:", await box.count());
if (await box.count()) await box.first().check().catch(() => {});
await page.waitForTimeout(500);
await buttons("шаг 2");
const next = dialog().getByRole("button", { name: /Далее: Письмо/ });
if (await next.count()) { await next.click(); await page.waitForTimeout(800); }
await buttons("шаг 3");
const next2 = dialog().getByRole("button", { name: /Далее: Предпросмотр/ });
if (await next2.count() && !(await next2.first().isDisabled())) { await next2.click(); await page.waitForTimeout(800); }
await buttons("шаг 4");
await page.screenshot({ path: ".verify/first-week/peek-rfq.png" });
await browser.close();
