import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const [w,h] of [[390,844],[1440,900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: "light" });
  const errs: string[] = []; p.on("console", m => { if (m.type()==="error") errs.push(m.text()); });
  await p.goto("http://localhost:4630/", { waitUntil: "load" });
  await p.waitForSelector("html[data-booted]"); await p.waitForTimeout(1500);
  const note = await p.getByText("Демо без регистрации, с телефона, 3 минуты.").boundingBox();
  console.log(w, "note bottom", note && Math.round(note.y + note.height), "scrollW", await p.evaluate(() => document.documentElement.scrollWidth), errs);
  await p.screenshot({ path: "/private/tmp/claude-501/-Users-neeklo-Documents-Project---------------CRM/c72f1795-3bb5-49c5-b373-e12201265244/scratchpad/lp-" + w + "-top.jpg", type: "jpeg", quality: 70 });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0,0); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: "/private/tmp/claude-501/-Users-neeklo-Documents-Project---------------CRM/c72f1795-3bb5-49c5-b373-e12201265244/scratchpad/lp-" + w + "-full.jpg", type: "jpeg", quality: 60, fullPage: true });
}
await b.close();
