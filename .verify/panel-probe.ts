import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto("http://localhost:5273/gas/moderation?open=mk-2", { waitUntil: "domcontentloaded" });
await p.evaluate(() => sessionStorage.setItem("neeklo-fieldops-guide", JSON.stringify({ scenarioId: "gas-week", stepIndex: 2, status: { "gas-enter": "done", "gas-send": "done" }, collapsed: false, closed: false, finished: [], chain: { gasEntryId: "mk-2" } })));
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-tour="review-confirm"]', { timeout: 60000 });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => {
  const btn = document.querySelector('[data-tour="review-confirm"]')!.getBoundingClientRect();
  const aside = document.querySelector("aside[aria-labelledby]")!.getBoundingClientRect();
  const r = (x: DOMRect) => ({ top: Math.round(x.top), bottom: Math.round(x.bottom), h: Math.round(x.height) });
  const hit = document.elementFromPoint(btn.left + btn.width / 2, btn.top + btn.height / 2);
  const main = document.querySelector("#gas-main")!.getBoundingClientRect();
  return { btn: r(btn), aside: r(aside), vh: innerHeight, scroll: scrollY, hit: hit?.tagName + "." + (hit as HTMLElement)?.className?.slice(0, 60), main: r(main) };
});
console.log(JSON.stringify(info));
await p.screenshot({ path: ".verify/panel.jpg", type: "jpeg", quality: 70 });
await b.close();
