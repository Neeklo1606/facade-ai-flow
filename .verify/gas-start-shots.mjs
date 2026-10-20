// Снимки стартового экрана, инструкции, вопросов и финала (ADR-044, F2/F3/F7).
// Запуск: node .verify/gas-start-shots.mjs [base] — dev на 5284 по умолчанию.
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5284";
const out = "docs/gas/screenshots/start";
const only = process.argv[3];
const screens = [
  ["start", "/gas"],
  ["guide", "/gas/guide"],
  ["guide-calc", "/gas/guide?tab=calc"],
  ["questions", "/gas/questions"],
  ["finish", "/gas/finish"],
  // Финал с цепочкой показа: запись подставлена из факта (fr-7-0, 395 мин, 44 847 ₽) только для снимка
  ["finish-filled", "/gas/finish?filled=1"],
  ["summary", "/gas/summary"],
];
const sizes = [
  ["390", { width: 390, height: 844 }, true],
  ["1440", { width: 1440, height: 900 }, false],
];
const browser = await chromium.launch();
const errors = [];
for (const theme of ["light", "dark"]) {
  for (const [label, viewport, mobile] of sizes) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: theme,
      locale: "ru-RU",
    });
    await context.addInitScript((mode) => {
      try {
        localStorage.setItem("neeklo-fieldops-theme", mode);
        if (location.search.includes("filled=1")) {
          sessionStorage.setItem(
            "neeklo-fieldops-guide",
            JSON.stringify({
              scenarioId: "gas-week",
              stepIndex: 5,
              status: {},
              chain: {
                gasEntryId: "fr-7-0",
                gasEntryNumber: "ГЗ-00001",
                gasFile: "Выработка_бригад_28.09-03.10.2026.xlsx",
              },
            }),
          );
        }
        localStorage.setItem(
          "neeklo-gas-hint-seen",
          JSON.stringify(["start", "guide", "questions", "summary"]),
        );
      } catch {}
    }, theme);
    const page = await context.newPage();
    page.on(
      "console",
      (m) => m.type() === "error" && errors.push(`${label} ${theme}: ${m.text().slice(0, 160)}`),
    );
    page.on("pageerror", (e) => errors.push(`${label} ${theme}: ${String(e).slice(0, 160)}`));
    for (const [name, path] of screens) {
      if (only && !name.startsWith(only)) continue;
      await page.goto(base + path, { waitUntil: "load" });
      await page.locator("main").waitFor({ timeout: 60000 });
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 0)
        errors.push(`${name} ${label} ${theme}: горизонтальное переполнение ${overflow}px`);
      if (mobile) {
        // Снимок первого экрана телефона как его видит человек: шапка и нижняя панель на месте
        await page.screenshot({ path: `${out}/${name}-${label}-${theme}-top.jpg` });
      }
      await page.screenshot({ path: `${out}/${name}-${label}-${theme}.jpg`, fullPage: true });
    }
    await context.close();
  }
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "без ошибок консоли и переполнения");
