/**
 * Первый экран бригадира (ADR-061, решения 15 и 16; порог T8): LCP `/gas/brigade` с ролью
 * бригадира не больше 2,5 с на 4G, медиана трёх замеров Lighthouse.
 *
 * Мерится в условиях хостинга: перед сервером демо-сборки поднимается прокси HTTP/2 со
 * сжатием (`scripts/h2-proxy.mjs`, сертификат на localhost создаётся openssl на время
 * замера). Без этого локальный HTTP/1.1 ставит 178 запросов в очередь из шести соединений,
 * и замер говорит о сервере замера, а не о продукте. Медленный 4G печатается справочно.
 *
 * Сервер демо-сборки должен работать: адрес — `LH_BASE` (по умолчанию http://localhost:4630).
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";
import { getServerSnapshot } from "../src/adapters/gas-ops/state";

const upstream = process.env["LH_BASE"] ?? "http://localhost:4630";
const PORT = 4632;
const LIMIT_MS = 2500;
const RUNS = 3;

const dir = mkdtempSync(join(tmpdir(), "first-screen-"));
const key = join(dir, "key.pem");
const cert = join(dir, "cert.pem");
const made = spawnSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
  ],
  { encoding: "utf8" },
);
if (made.status !== 0) {
  console.error(`first-screen: openssl не создал сертификат на время замера: ${made.stderr}`);
  process.exit(1);
}

const proxy = spawn("node", ["scripts/h2-proxy.mjs"], {
  env: { ...process.env, UPSTREAM: upstream, PORT: String(PORT), KEY: key, CERT: cert },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("прокси HTTP/2 не поднялся")), 10_000);
  proxy.stdout!.on("data", () => {
    clearTimeout(timer);
    resolve();
  });
});

// Роль `/gas` живёт в снимке вкладки: снимок демо-контура с бригадиром кладётся до загрузки
const foremanTab = JSON.stringify({
  version: 7,
  snapshot: { ...getServerSnapshot(), actorId: "u-foreman-1" },
});

/** Профили сети: 4G по WebPageTest и медленный 4G Lighthouse; процессор телефона ×4 */
const PROFILES = {
  "4G": { rttMs: 170, throughputKbps: 9000 },
  "медленный 4G": { rttMs: 150, throughputKbps: 1638.4 },
} as const;

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-sandbox", "--ignore-certificate-errors"],
  ...(process.env["CHROME_PATH"] ? { chromePath: process.env["CHROME_PATH"] } : {}),
});
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const sec = (ms: number) => (ms / 1000).toFixed(1).replace(".", ",");
let failed = false;

try {
  for (const [name, network] of Object.entries(PROFILES)) {
    const runs = name === "4G" ? RUNS : 1;
    const fcp: number[] = [];
    const lcp: number[] = [];
    let protocols = new Set<string>();
    let scripts = 0;
    for (let run = 0; run < runs; run += 1) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument((value: string) => {
        localStorage.setItem("neeklo-gas-ops-v1:public", value);
        // Тур первого входа закрыл бы экран: отмечен просмотренным, как в сквозных тестах
        localStorage.setItem("gaika-tour-seen", JSON.stringify(["foreman", "manager", "director"]));
      }, foremanTab);
      const result = await lighthouse(
        `https://localhost:${PORT}/gas/brigade`,
        {
          output: "json",
          logLevel: "error",
          onlyCategories: ["performance"],
          formFactor: "mobile",
          throttlingMethod: "simulate",
          throttling: {
            ...network,
            cpuSlowdownMultiplier: 4,
            requestLatencyMs: 0,
            downloadThroughputKbps: 0,
            uploadThroughputKbps: 0,
          },
        },
        undefined,
        page,
      );
      await page.close();
      const audits = result?.lhr.audits ?? {};
      fcp.push(audits["first-contentful-paint"]?.numericValue ?? Infinity);
      lcp.push(audits["largest-contentful-paint"]?.numericValue ?? Infinity);
      const requests =
        (
          audits["network-requests"]?.details as {
            items?: { protocol?: string; resourceType?: string }[];
          }
        )?.items ?? [];
      protocols = new Set(requests.map((r) => r.protocol ?? "?"));
      scripts = requests.filter((r) => r.resourceType === "Script").length;
    }
    const verdict = median(lcp);
    const judged = name === "4G";
    if (judged && verdict > LIMIT_MS) failed = true;
    console.log(
      `${name}: FCP ${sec(median(fcp))} с · LCP ${sec(verdict)} с` +
        (judged
          ? ` (медиана ${runs}, порог ${sec(LIMIT_MS)} с${verdict > LIMIT_MS ? " ✗" : ""})`
          : " (справочно)") +
        ` · скриптов ${scripts} · протокол ${[...protocols].join(", ")}`,
    );
    if (judged && !protocols.has("h2")) {
      console.error("first-screen: замер прошёл не по HTTP/2, условия хостинга не воспроизведены");
      failed = true;
    }
  }
} finally {
  await browser.disconnect();
  chrome.kill();
  proxy.kill();
  rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error("Первый экран бригадира: порог не выполнен");
  process.exit(1);
}
console.log("Первый экран бригадира: не дольше 2,5 с на 4G");
