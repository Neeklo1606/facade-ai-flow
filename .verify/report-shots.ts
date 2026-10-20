/**
 * Снимки отчёта (ADR-044, F6): неделя и день на 1440 и 390, светлая и тёмная тема.
 * Запуск: `GAS_SHOTS_BASE=http://localhost:5283 bun run .verify/report-shots.ts`
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { GAS_STATE_KEY, reportState, SHOW_ENTRY_ID } from "../e2e/gas-report-state";

const base = process.env["GAS_SHOTS_BASE"] ?? "http://localhost:5283";
const out = process.env["GAS_SHOTS_OUT"] ?? "docs/gas/screenshots/report";
const only = process.env["GAS_SHOTS_ONLY"];
mkdirSync(out, { recursive: true });

const state = reportState();
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"] as const) {
    for (const view of ["week", "day"] as const) {
      const name = `${width}-${view}-${theme}`;
      if (only && !name.includes(only)) continue;
      const context = await browser.newContext({
        viewport: { width, height: width > 500 ? 900 : 844 },
        deviceScaleFactor: width > 500 ? 1 : 2,
        colorScheme: theme,
        locale: "ru-RU",
        ...(width < 500 ? { isMobile: true, hasTouch: true } : {}),
      });
      await context.addInitScript(
        ({ key, value, mode }) => {
          localStorage.setItem(key, value);
          localStorage.setItem("neeklo-fieldops-theme", mode);
          localStorage.setItem("neeklo-gas-hint-seen", JSON.stringify(["reports"]));
        },
        { key: GAS_STATE_KEY, value: state, mode: theme },
      );
      const page = await context.newPage();
      const path = view === "day" ? `/gas/reports?highlight=${SHOW_ENTRY_ID}` : "/gas/reports";
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.waitForSelector("html[data-booted]", { timeout: 90_000 });
      await page.locator("[data-report-row]").first().waitFor({ timeout: 60_000 });
      if (view === "day" && width > 500) await page.getByRole("tab", { name: "Сб 03.10" }).click();
      await page.waitForTimeout(view === "day" ? 900 : 400);
      await page.screenshot({ path: `${out}/${name}.jpg`, fullPage: width < 500 });
      console.log(`${out}/${name}.jpg`);
      await context.close();
    }
  }
}
await browser.close();
