import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const path of ["/gas/moderation", "/gas/reports"]) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await p.goto("http://localhost:5273" + path, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("html[data-booted]", { timeout: 60000 });
  await p.waitForTimeout(1200);
  await p.addStyleTag({ content: "html { font-size: 130% !important; }" });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const base = document.documentElement.scrollWidth;
    const found: string[] = [];
    const walk = (el: Element, depth: number) => {
      if (depth > 9) return;
      for (const child of [...el.children]) {
        const h = child as HTMLElement;
        const prev = h.style.display;
        h.style.display = "none";
        const w = document.documentElement.scrollWidth;
        h.style.display = prev;
        if (w < base) {
          found.push(`${"  ".repeat(depth)}${child.tagName}.${String(h.className).slice(0, 70)} → ${w}`);
          walk(child, depth + 1);
          return;
        }
      }
    };
    walk(document.body, 0);
    return { sw: base, out: found };
  });
  console.log(path, JSON.stringify(r, null, 1));
}
await b.close();
