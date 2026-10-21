import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
const base = "http://localhost:5291";
const out = "docs/design/states";
mkdirSync(out, { recursive: true });
const routes: [string, string, string | null][] = [
  ["gas-moderation", "/gas/moderation", null],
  ["gas-entries", "/gas/entries", null],
  ["gas-reports", "/gas/reports", null],
  ["gas-objects", "/gas/objects", null],
  ["gas-brigades", "/gas/brigades", null],
  ["gas-estimates", "/gas/estimates", null],
  ["gas-summary", "/gas/summary", null],
  ["gaika-today", "/today", "e-gareev"],
  ["gaika-check", "/check", "e-volkova"],
  ["gaika-inbox", "/inbox", "e-dorohov"],
  ["gaika-projects", "/projects", "e-sokolov"],
  ["gaika-attention", "/attention", "e-sokolov"],
];
const states = ["loading", "empty", "error", "filtered"];
const browser = await chromium.launch();
let n = 0;
for (const width of [390, 1440])
  for (const [key, path, persona] of routes)
    for (const state of states) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: width < 768 ? 2 : 1, isMobile: width < 768, hasTouch: width < 768 });
      await ctx.addInitScript((p) => { try { localStorage.setItem("neeklo-fieldops-theme", "light"); for (const k of ["moderation","entries","reports","objects","brigades","estimates","summary"]) localStorage.setItem(`neeklo-hint-gas-${k}`, "1"); if (p) { sessionStorage.setItem("neeklo-fieldops-role-chosen","1"); sessionStorage.setItem("neeklo-fieldops-start-applied","1"); sessionStorage.setItem("neeklo-fieldops-persona", p); } } catch {} }, persona);
      const page = await ctx.newPage();
      try {
        await page.goto(`${base}${path}?state=${state}${state === "error" ? "&offline=1" : ""}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector("html[data-booted]", { timeout: 60000 });
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${out}/${key}-${state}-${width}.jpg`, type: "jpeg", quality: 72 });
        n++;
      } catch (e) { console.log("fail", key, state, width, String(e).slice(0, 100)); }
      await ctx.close();
    }
await browser.close();
console.log("shots", n);
