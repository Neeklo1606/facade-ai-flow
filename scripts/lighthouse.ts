/**
 * Lighthouse (ADR-013, п. 7; методика — ADR-032): три экрана профилем «десктоп» и экраны
 * показа профилем «телефон» (этап D), пороги заданы целью, а не замером.
 * Сервер демо-сборки должен работать: адрес — `LH_BASE` (по умолчанию http://localhost:4630).
 * Вкладка открывается с выбранной ролью руководителя: иначе замер показал бы экран выбора роли.
 * Chrome — `CHROME_PATH`, иначе установленный в системе.
 *
 * Один замер на экран был невоспроизводим: оценка производительности частично читает занятость
 * машины, а не код. Профиль «десктоп» моделирует сеть, но длительности задач основного потока
 * берёт с реальной машины без масштабирования, а Total Blocking Time — 30 % оценки. Поэтому
 * (ADR-032):
 *   • каждый экран сперва прогревается переходом, который не засчитывается, — иначе первый
 *     измеренный экран оплачивает прогрев JIT сервера, поднятого прямо перед этим шагом;
 *   • экран меряется `LH_RUNS` раз (по умолчанию 3);
 *   • производительность судится по медиане повторов — она не ведётся на один выброс;
 *   • доступность и практики судятся по каждому повтору: разброс у них нулевой, и медиана
 *     там скрыла бы нарушение, всплывшее в одном прогоне из трёх.
 * Пороги при этом те же, что и были: меняется способ оценить величину, а не требование к ней.
 */
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";
import puppeteer, { type Browser } from "puppeteer-core";

const base = process.env["LH_BASE"] ?? "http://localhost:4630";
const runs = Number(process.env["LH_RUNS"] ?? "3");
const screens = ["/projects", "/projects/p-korona", "/projects/p-korona/procurement"];

/** Как категория сводится к вердикту: медиана — только там, где шум доказан (ADR-032, п. 3–4) */
type Verdict = "median" | "every";
const thresholds: Record<string, { min: number; verdict: Verdict }> = {
  accessibility: { min: 0.95, verdict: "every" },
  "best-practices": { min: 0.9, verdict: "every" },
  performance: { min: 0.7, verdict: "median" },
};

if (!Number.isInteger(runs) || runs < 1) {
  console.error(`LH_RUNS должно быть целым числом не меньше 1, получено: ${runs}`);
  process.exit(1);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  // Чётное число повторов: берём меньшее из двух средних, чтобы не судить мягче замеров
  return sorted.length % 2 === 1 ? sorted[middle]! : sorted[middle - 1]!;
}

const percent = (score: number) => String(Math.round(score * 100)).padStart(3);

/** Вкладка с выбранной ролью: иначе замер показал бы экран выбора роли */
async function openPage(browser: Browser) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
    sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
    sessionStorage.setItem("neeklo-fieldops-persona", "e-sokolov");
  });
  return page;
}

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-sandbox"],
  ...(process.env["CHROME_PATH"] ? { chromePath: process.env["CHROME_PATH"] } : {}),
});
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
const failures: string[] = [];

try {
  console.log(`Lighthouse: ${screens.length} экрана, повторов на экран — ${runs} (ADR-032)`);
  for (const path of screens) {
    /*
     * Прогрев: переход, который не засчитывается. Снимает смещение первого касания в причине,
     * а не усреднением. Замер от этого честнее не становится и хуже тоже: Lighthouse чистит
     * кэш и хранилище перед каждым переходом, так что меряется по-прежнему первый визит.
     */
    const warmup = await openPage(browser);
    await warmup.goto(base + path, { waitUntil: "networkidle0" });
    await warmup.close();

    const scores: Record<string, number[]> = {};
    const benchmarks: number[] = [];
    for (let run = 1; run <= runs; run += 1) {
      const page = await openPage(browser);
      const result = await lighthouse(
        base + path,
        { output: "json", logLevel: "error", onlyCategories: Object.keys(thresholds) },
        desktopConfig,
        page,
      );
      await page.close();
      if (!result) throw new Error(`Lighthouse не вернул результат: ${path}`);
      const categories = result.lhr.categories;
      benchmarks.push(result.lhr.environment.benchmarkIndex);
      const line = Object.keys(thresholds).map((id) => {
        const score = categories[id]?.score ?? 0;
        (scores[id] ??= []).push(score);
        return `${id} ${percent(score)}`;
      });
      console.log(
        `  ${path} замер ${run}/${runs}: ${line.join(" · ")} ` +
          `(benchmarkIndex ${Math.round(result.lhr.environment.benchmarkIndex)})`,
      );
    }

    const summary = Object.entries(thresholds).map(([id, { min, verdict }]) => {
      const measured = scores[id]!;
      const judged = verdict === "median" ? median(measured) : Math.min(...measured);
      if (judged < min) {
        failures.push(
          `${path} · ${id}: ${verdict === "median" ? "медиана" : "худший замер"} ` +
            `${Math.round(judged * 100)} < ${Math.round(min * 100)} ` +
            `(замеры: ${measured.map((s) => Math.round(s * 100)).join(", ")})`,
        );
      }
      const spread =
        runs > 1
          ? ` [${Math.round(Math.min(...measured) * 100)}–${Math.round(Math.max(...measured) * 100)}]`
          : "";
      return (
        `${id} ${verdict === "median" ? "медиана" : "мин"} ${percent(judged)}${spread}` +
        `${judged < min ? ` < ${Math.round(min * 100)} ✗` : ""}`
      );
    });
    console.log(
      `${path}: ${summary.join(" · ")}` +
        (runs > 1 ? `  (benchmarkIndex ${Math.round(median(benchmarks))})` : ""),
    );
  }

  /*
   * Телефон (этап D, D5): экран входа демо и «Сегодня» прораба мобильным профилем Lighthouse.
   * Доступность — 100: это экраны, с которых клиент начинает показ.
   */
  const mobile: { path: string; persona: string | null }[] = [
    { path: "/", persona: null },
    // Вход в демо с сайта (шаг L8): страница сайта, отрисованная на сервере
    { path: "/demo", persona: null },
    { path: "/today", persona: "e-gareev" },
    // Первый экран контура газа (ADR-045, V9): цифры FCP и LCP печатаются для отчёта
    { path: "/gas", persona: null },
    // «Обзор» руководителя (ADR-052): стартовый экран, порог скорости 2,5 с из задачи владельца
    { path: "/gas/overview", persona: null },
  ];
  /*
   * Производительность телефона печатается, но не держит порог: локальный node-сервер отдаёт
   * статику без сжатия (CSS 141 КБ вместо 25 КБ, которые отдаёт хостинг), и замер на нём
   * говорит о сети замера, а не о продукте. Её цифра снимается на опубликованном адресе.
   */
  const mobileThresholds: Record<string, number> = {
    accessibility: 1,
    "best-practices": 0.9,
    performance: 0,
  };
  for (const { path, persona } of mobile) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((id: string | null) => {
      if (!id) return;
      sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
      sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
      sessionStorage.setItem("neeklo-fieldops-persona", id);
    }, persona);
    const result = await lighthouse(
      base + path,
      { output: "json", logLevel: "error", onlyCategories: Object.keys(mobileThresholds) },
      undefined,
      page,
    );
    await page.close();
    const categories = result?.lhr.categories ?? {};
    const line = Object.entries(mobileThresholds).map(([id, min]) => {
      const score = categories[id]?.score ?? 0;
      // Мобильный профиль меряется один раз: его производительность порога не держит,
      // а доступность и практики не шумят (ADR-032, п. 4) — провал пишется в общий список
      if (score < min) {
        failures.push(
          `${path} · телефон · ${id}: ${Math.round(score * 100)} < ${Math.round(min * 100)}`,
        );
      }
      return `${id} ${Math.round(score * 100)}${score < min ? ` < ${min * 100} ✗` : ""}${id === "performance" ? " (без порога: локально без сжатия)" : ""}`;
    });
    if ((categories["accessibility"]?.score ?? 0) < 1) {
      const audits = result?.lhr.audits ?? {};
      const broken = Object.values(audits)
        .filter((audit) => audit.score === 0 && audit.scoreDisplayMode === "binary")
        .map((audit) => audit.id);
      console.log(`  не прошли: ${broken.join(", ")}`);
    }
    // Первый экран в секундах при мобильной сети Lighthouse (имитация медленного 4G)
    const audits = result?.lhr.audits ?? {};
    const seconds = (id: string) =>
      audits[id]?.numericValue
        ? (audits[id]!.numericValue! / 1000).toFixed(1).replace(".", ",")
        : "—";
    const shift = audits["cumulative-layout-shift"]?.numericValue;
    line.push(
      `FCP ${seconds("first-contentful-paint")} с · LCP ${seconds("largest-contentful-paint")} с · CLS ${shift === undefined ? "—" : shift.toFixed(3).replace(".", ",")}`,
    );
    console.log(`телефон ${path}: ${line.join(" · ")}`);
  }
} finally {
  await browser.disconnect();
  chrome.kill();
}

if (failures.length) {
  console.error(`Lighthouse: ниже порога — ${failures.length}`);
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}
console.log("Lighthouse: все экраны не ниже порогов");
