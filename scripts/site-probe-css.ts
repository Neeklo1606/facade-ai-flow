/** Какие правила задают font-size элементу (ADR-067, N8). bun scripts/site-probe-css.ts <адрес> <селектор> */
import { chromium } from "@playwright/test";

const [url, selector] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url!, { waitUntil: "load" });
const cdp = await page.context().newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");
const { root } = await cdp.send("DOM.getDocument");
const { nodeId } = await cdp.send("DOM.querySelector", {
  nodeId: root.nodeId,
  selector: selector!,
});
const matched = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
for (const rule of matched.matchedCSSRules ?? []) {
  const size = rule.rule.style.cssProperties.find((p) => p.name === "font-size" && p.value);
  if (size) console.log(rule.rule.selectorList.text.slice(0, 120), "→", size.value);
}
await browser.close();
