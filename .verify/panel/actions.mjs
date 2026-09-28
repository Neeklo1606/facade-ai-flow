/** Каждое действие шторки «+» открывает форму, а не ведёт в пустоту (ADR-026, п. 4) */
import { chromium } from "playwright";
const browser = await chromium.launch();
const cases = [
  ["e-gareev", "прораб", "/projects/p-korona/field-reports"],
  ["e-dorohov", "снабжение", "/projects/p-korona/procurement"],
  ["e-volkova", "пто", "/projects/p-korona/documents"],
  ["e-sokolov", "руководитель", "/projects/p-korona"],
];
for (const [persona, title, start] of cases) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
  await page.addInitScript((id) => {
    sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
    sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
    sessionStorage.setItem("neeklo-fieldops-persona", id);
  }, persona);
  await page.goto(`http://localhost:4630${start}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1600);
  await page.locator('[data-tour="nav-plus"]').click();
  await page.waitForTimeout(600);
  const rows = await page.locator('[role="dialog"][data-state="open"] button').all();
  const labels = [];
  for (const row of rows) labels.push((await row.innerText()).split("\n")[0]);
  console.log(`\n${title}: ${labels.join(" | ")}`);
  for (let index = 0; index < labels.length; index += 1) {
    // Каждый раз открываем шторку заново: после действия экран меняется
    if (index > 0) {
      await page.goto(`http://localhost:4630${start}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1400);
      await page.locator('[data-tour="nav-plus"]').click();
      await page.waitForTimeout(500);
    }
    const sheetRows = page.locator('[role="dialog"][data-state="open"] button');
    await sheetRows.nth(index).click();
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][data-state="open"], [role="dialog"][aria-modal="true"]');
      const title = dialog?.querySelector("h2, h3, [id*='title']")?.textContent?.trim().slice(0, 40) ?? null;
      const focusZone = document.activeElement;
      return {
        url: location.pathname + location.search,
        dialog: title,
        focus: focusZone ? `${focusZone.tagName}` : null,
      };
    });
    console.log(`  ${labels[index]} → ${state.url} окно: ${state.dialog ?? "нет"} фокус: ${state.focus}`);
  }
  await page.close();
}
await browser.close();
