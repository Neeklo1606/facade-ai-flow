import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
await page.addInitScript(() => {
  sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
  sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
  sessionStorage.setItem("neeklo-fieldops-persona", "e-dorohov");
});
await page.goto("http://localhost:4630/projects/p-korona/procurement", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
await page.locator('[data-tour="nav-plus"]').click();
await page.waitForTimeout(600);
const trace = await page.evaluate(async () => {
  const out = [];
  const label = () => {
    const el = document.activeElement;
    return el ? `${el.tagName}:${el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 12)}` : "нет";
  };
  out.push(`до Esc ${label()}`);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  for (let i = 0; i < 14; i += 1) {
    await new Promise((r) => setTimeout(r, 100));
    out.push(`${(i + 1) * 100}мс ${label()}`);
  }
  return out;
});
console.log(trace.join("\n"));
await browser.close();
