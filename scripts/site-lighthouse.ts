/**
 * Lighthouse сайта для приёмки (ADR-067, раздел 12): главная и три страницы задач, телефон
 * и компьютер, все четыре категории и CLS. Печатает таблицу, порогов не держит: пороги
 * приёмки сверяются в docs/site/REPORT.md.
 *
 * Локальный node-сервер отдаёт статику без сжатия, а хостинг сжимает. Поэтому скрипт ставит
 * перед сервером прокси с gzip: так замер ближе к опубликованному адресу. Сервер нужно
 * запустить с SEO_INDEX=on, иначе категория SEO честно покажет noindex.
 *
 * bun scripts/site-lighthouse.ts [адрес сервера] [повторов]
 */
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";
import { gzipSync } from "node:zlib";

const upstream = (process.argv[2] ?? "http://localhost:4673").replace(/\/+$/, "");
const runs = Number(process.argv[3] ?? "3");
const PAGES = ["/", "/uchet-vremeni-brigad", "/snabzhenie", "/ispolnitelnaya-dokumentatsiya"];
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

const proxy = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const response = await fetch(upstream + url.pathname + url.search, {
      headers: request.headers,
      redirect: "manual",
    });
    const type = response.headers.get("content-type") ?? "";
    const headers = new Headers(response.headers);
    if (!/text|javascript|json|xml|svg/.test(type))
      return new Response(response.body, { status: response.status, headers });
    const body = gzipSync(new Uint8Array(await response.arrayBuffer()));
    headers.set("content-encoding", "gzip");
    headers.delete("content-length");
    return new Response(body, { status: response.status, headers });
  },
});
const base = `http://localhost:${proxy.port}`;

const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const rows: string[] = [];
try {
  for (const profile of ["телефон", "компьютер"] as const) {
    for (const path of PAGES) {
      const scores: Record<string, number[]> = {};
      const cls: number[] = [];
      const lcp: number[] = [];
      for (let run = 0; run <= runs; run += 1) {
        const page = await browser.newPage();
        const result = await lighthouse(
          base + path,
          { output: "json", logLevel: "error", onlyCategories: CATEGORIES },
          profile === "компьютер" ? desktopConfig : undefined,
          page,
        );
        await page.close();
        // Первый прогон прогревает сервер и не засчитывается (ADR-032)
        if (run === 0) continue;
        for (const id of CATEGORIES)
          (scores[id] ??= []).push(Math.round((result?.lhr.categories[id]?.score ?? 0) * 100));
        cls.push(result?.lhr.audits["cumulative-layout-shift"]?.numericValue ?? 1);
        lcp.push((result?.lhr.audits["largest-contentful-paint"]?.numericValue ?? 0) / 1000);
        if (
          run === runs &&
          (scores["accessibility"]?.some((s) => s < 100) || scores["seo"]?.some((s) => s < 100))
        ) {
          const failed = Object.values(result?.lhr.audits ?? {})
            .filter((a) => a.score === 0 && a.scoreDisplayMode === "binary")
            .map((a) => a.id);
          console.log(`  ${profile} ${path} не прошли: ${failed.join(", ")}`);
        }
      }
      const row = `| ${profile} | ${path} | ${CATEGORIES.map((id) => median(scores[id]!)).join(" | ")} | ${median(cls).toFixed(3)} | ${median(lcp).toFixed(1)} с |`;
      rows.push(row);
      console.log(row);
    }
  }
} finally {
  await browser.disconnect();
  chrome.kill();
  proxy.stop(true);
}
console.log(
  "\n| Профиль | Страница | Performance | Accessibility | Best practices | SEO | CLS | LCP |",
);
console.log("|---|---|---|---|---|---|---|---|");
for (const row of rows) console.log(row);
