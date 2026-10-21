import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:5273";
const out = process.env.OUT ?? "docs/design/scale";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const width of [390, 1440])
  for (const theme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 768 ? 844 : 900 },
      deviceScaleFactor: width < 768 ? 2 : 1,
      isMobile: width < 768,
      hasTouch: width < 768,
      colorScheme: theme,
    });
    await ctx.addInitScript((t) => {
      try { localStorage.setItem("neeklo-fieldops-theme", t); sessionStorage.setItem("neeklo-fieldops-role-chosen","1"); sessionStorage.setItem("neeklo-fieldops-start-applied","1"); sessionStorage.setItem("neeklo-fieldops-persona","e-sokolov"); } catch {}
    }, theme);
    const page = await ctx.newPage();
    await page.goto(`${base}/design-system`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="scale-gallery"]', { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.addStyleTag({ content: `.app-window,.app-shell,main{height:auto!important;max-height:none!important;overflow:visible!important} nav[aria-label="Основная навигация"]{display:none!important} header{position:static!important}` });
    await page.waitForTimeout(300);
    await page.locator('[data-testid="scale-gallery"]').screenshot({ path: `${out}/design-system-${width}-${theme}.jpg`, type: "jpeg", quality: 82 });
    console.log(width, theme, "ok");
    await ctx.close();
  }
await browser.close();
