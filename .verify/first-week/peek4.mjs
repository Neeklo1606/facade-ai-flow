import { chromium } from "playwright";
import { loginByPhone } from "./login.mjs";
const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
await loginByPhone(page, new URL(url).origin, "+79216552784");
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.locator("input[type=file]").first().setInputFiles(".verify/first-week/nomenklatura.xlsx");
await page.waitForTimeout(1500);
const dialog = page.getByRole("dialog");
console.log("диалог:", await dialog.count());
if (await dialog.count()) {
  console.log((await dialog.first().innerText()).slice(0, 700));
  console.log("--- кнопки:");
  for (const b of await dialog.first().getByRole("button").all()) {
    const t = (await b.innerText().catch(() => "")).trim();
    if (t) console.log(" •", t.slice(0, 40));
  }
}
await page.screenshot({ path: ".verify/first-week/peek-upload.png" });
await browser.close();
