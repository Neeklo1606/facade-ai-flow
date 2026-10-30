import { chromium } from "@playwright/test";
const b = await chromium.launch();
const problems: string[] = [];
for (const theme of ["light", "dark"] as const) for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme, locale: "ru-RU" });
  await ctx.addInitScript((m) => localStorage.setItem("neeklo-fieldops-theme", m), theme);
  const p = await ctx.newPage();
  const errs: string[] = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://localhost:4630/", { waitUntil: "load" });
  await p.waitForSelector("html[data-booted]");
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(1200);
  const note = await p.getByText("Демо без регистрации, с телефона, 3 минуты.").boundingBox();
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  if (sw > w) problems.push(`${w} ${theme}: scroll ${sw}`);
  if (errs.length) problems.push(`${w} ${theme}: ${errs[0]}`);
  console.log(w, theme, "note bottom", note && Math.round(note.y + note.height));
  await p.screenshot({ path: `docs/design/service-v1/s7/landing-${w}-${theme}-first.jpg`, type: "jpeg", quality: 70 });
  await p.screenshot({ path: `docs/design/service-v1/s7/landing-${w}-${theme}-full.jpg`, type: "jpeg", quality: 60, fullPage: true });
  await ctx.close();
}
await b.close();
console.log(problems.join("\n") || "замечаний нет");
