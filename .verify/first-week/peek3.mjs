import { chromium } from "playwright";
import { loginByPhone } from "./login.mjs";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
await loginByPhone(page, "http://localhost:4712", "+79216552784");
await page.goto("http://localhost:4712/projects", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Добавить объект/ }).first().click();
await page.waitForTimeout(800);
for (const label of ["Регион", "Ответственный"]) {
  const box = page.getByRole("combobox", { name: new RegExp(label) }).first();
  if (!(await box.count())) { console.log(label, "— нет"); continue; }
  await box.click();
  await page.waitForTimeout(600);
  const options = await page.getByRole("option").all();
  console.log(`${label}: вариантов ${options.length}`);
  for (const o of options.slice(0, 8)) console.log("   •", (await o.innerText()).trim());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}
await page.screenshot({ path: ".verify/first-week/w02-obekt-forma.png" });
await browser.close();
