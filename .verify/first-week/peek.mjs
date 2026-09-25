import { chromium } from "playwright";
import { loginByPhone } from "./login.mjs";
const [url, phone] = [process.argv[2], process.argv[3] ?? "+79216552784"];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
const entered = await loginByPhone(page, new URL(url).origin, phone);
console.log("вход:", entered.url, "код:", entered.code);
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
console.log("URL:", page.url());
console.log("--- текст:");
console.log((await page.locator("body").innerText()).slice(0, 1500));
console.log("--- кнопки:");
for (const b of await page.getByRole("button").all()) {
  const t = (await b.innerText().catch(() => "")).replace(/\n/g, " ").trim();
  if (t) console.log(" •", t.slice(0, 60));
}
console.log("--- ссылки:");
for (const l of (await page.getByRole("link").all()).slice(0, 25)) {
  const t = (await l.innerText().catch(() => "")).replace(/\n/g, " ").trim();
  if (t) console.log(" •", t.slice(0, 50), "→", await l.getAttribute("href"));
}
await browser.close();
