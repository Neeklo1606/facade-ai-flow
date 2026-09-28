import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
await page.addInitScript(() => {
  sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
  sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
  sessionStorage.setItem("neeklo-fieldops-persona", "e-gareev");
});
await page.goto("http://localhost:4630/projects/p-korona/field-reports", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
await page.locator('[data-tour="nav-plus"]').click();
await page.waitForTimeout(700);
const label = () => page.evaluate(() => {
  const el = document.activeElement;
  const sheet = document.querySelector('[role="dialog"][data-state="open"]');
  return {
    active: el ? `${el.tagName}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 18)}` : "нет",
    insideSheet: !!(sheet && el && sheet.contains(el)),
  };
});
console.log("после открытия:", JSON.stringify(await label()));
for (const step of [1, 2, 3]) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(200);
  console.log(`Tab ${step}:`, JSON.stringify(await label()));
}
await browser.close();
