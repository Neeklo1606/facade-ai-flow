/**
 * Lighthouse (ADR-013, п. 7): три экрана, профиль «десктоп», пороги заданы целью, а не замером.
 * Сервер демо-сборки должен работать: адрес — `LH_BASE` (по умолчанию http://localhost:4630).
 * Вкладка открывается с выбранной ролью руководителя: иначе замер показал бы экран выбора роли.
 * Chrome — `CHROME_PATH`, иначе установленный в системе.
 */
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const base = process.env["LH_BASE"] ?? "http://localhost:4630";
const screens = ["/projects", "/projects/p-korona", "/projects/p-korona/procurement"];
const thresholds: Record<string, number> = {
  accessibility: 0.95,
  "best-practices": 0.9,
  performance: 0.7,
};

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-sandbox"],
  ...(process.env["CHROME_PATH"] ? { chromePath: process.env["CHROME_PATH"] } : {}),
});
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
let failed = 0;

try {
  for (const path of screens) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
      sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
      sessionStorage.setItem("neeklo-fieldops-persona", "e-sokolov");
    });
    const result = await lighthouse(
      base + path,
      { output: "json", logLevel: "error", onlyCategories: Object.keys(thresholds) },
      desktopConfig,
      page,
    );
    await page.close();
    const categories = result?.lhr.categories ?? {};
    const line = Object.entries(thresholds).map(([id, min]) => {
      const score = categories[id]?.score ?? 0;
      if (score < min) failed += 1;
      return `${id} ${Math.round(score * 100)}${score < min ? ` < ${min * 100} ✗` : ""}`;
    });
    console.log(`${path}: ${line.join(" · ")}`);
  }
} finally {
  await browser.disconnect();
  chrome.kill();
}

if (failed) {
  console.error(`Lighthouse: ниже порога — ${failed}`);
  process.exit(1);
}
console.log("Lighthouse: все экраны не ниже порогов");
