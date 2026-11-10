/**
 * Почему медленно (ADR-067, N8): элемент LCP, его фазы, блокирующие ресурсы и вес страницы
 * в профиле телефона. bun scripts/site-lh-why.ts <адрес страницы>
 */
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

import { gzipSync } from "node:zlib";

// Прокси с gzip, как у хостинга: адрес сервера вторым аргументом
const target = new URL(process.argv[2]!);
const proxy = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const response = await fetch(target.origin + url.pathname + url.search, {
      headers: request.headers,
    });
    const type = response.headers.get("content-type") ?? "";
    const headers = new Headers(response.headers);
    if (!/text|javascript|json|xml|svg/.test(type))
      return new Response(response.body, { status: response.status, headers });
    headers.set("content-encoding", "gzip");
    headers.delete("content-length");
    return new Response(gzipSync(new Uint8Array(await response.arrayBuffer())), {
      status: response.status,
      headers,
    });
  },
});
const url = `http://localhost:${proxy.port}${target.pathname}`;
const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
const result = await lighthouse(url, {
  port: chrome.port,
  output: "json",
  logLevel: "error",
  onlyCategories: ["performance"],
});
chrome.kill();
proxy.stop(true);
const audits = result!.lhr.audits;
const show = (id: string) => {
  const audit = audits[id];
  if (!audit) return;
  console.log(`\n# ${id}: ${audit.displayValue ?? ""} score ${audit.score}`);
  const items = (audit.details as { items?: unknown[] } | undefined)?.items ?? [];
  for (const item of items.slice(0, 12)) console.log(JSON.stringify(item).slice(0, 300));
};
console.log(
  Object.keys(result!.lhr.audits)
    .filter((id) => /lcp|largest|render|font|critical/.test(id))
    .join(" "),
);
for (const id of [
  "lcp-breakdown-insight",
  "lcp-discovery-insight",
  "font-display-insight",
  "largest-contentful-paint",
  "largest-contentful-paint-element",
  "render-blocking-resources",
  "render-blocking-insight",
  "lcp-phases-insight",
  "total-byte-weight",
  "bootup-time",
  "total-blocking-time",
  "unused-javascript",
  "font-display",
  "network-dependency-tree-insight",
])
  show(id);
