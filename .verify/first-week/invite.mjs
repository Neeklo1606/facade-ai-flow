import { chromium } from "playwright";
const link = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
await page.goto(link, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
console.log("после ссылки:", page.url());
const enter = page.getByRole("button", { name: /Войти по приглашению/ });
if (await enter.count()) {
  await enter.click();
  await page.waitForTimeout(3000);
  console.log("после нажатия:", page.url());
}
await page.screenshot({ path: ".verify/first-week/05-posle-priglasheniya.png" });
const text = (await page.locator("body").innerText()).split("\n").slice(0, 12).join(" | ");
console.log("экран:", text.slice(0, 400));
await browser.close();
