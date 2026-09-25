import { chromium } from "playwright";
import { loginByPhone } from "./login.mjs";
const [url, action] = [process.argv[2], process.argv[3]];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
await loginByPhone(page, new URL(url).origin, process.env.PHONE ?? "+79216552784");
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
if (action) {
  await page.getByRole("button", { name: new RegExp(action) }).first().click();
  await page.waitForTimeout(1200);
}
console.log("URL:", page.url());
console.log("--- поля формы:");
for (const el of await page.locator("input, select, textarea").all()) {
  const id = await el.getAttribute("id");
  const label = id ? await page.locator(`label[for="${id}"]`).innerText().catch(() => "") : "";
  console.log(
    " •",
    (await el.evaluate((n) => n.tagName.toLowerCase())),
    (await el.getAttribute("type")) ?? "",
    "| метка:", (label || (await el.getAttribute("aria-label")) || "—").replace(/\n/g, " ").slice(0, 60),
  );
}
console.log("--- кнопки диалога:");
for (const b of await page.getByRole("button").all()) {
  const t = (await b.innerText().catch(() => "")).replace(/\n/g, " ").trim();
  if (t) console.log(" •", t.slice(0, 50));
}
await browser.close();
