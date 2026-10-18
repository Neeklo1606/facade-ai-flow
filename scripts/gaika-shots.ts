/**
 * Проверка визуального слоя ГАЙКИ (шаг G1): витрина в двух темах на 375 и 1440, отчёт по
 * контрасту токенов против порога WCAG AA, нарушения axe и поведение prefers-reduced-motion.
 *
 * Запуск по собранному приложению с витриной. Флаг нужен дважды: при сборке он оставляет код
 * витрины в бандле, при запуске — разрешает адрес (lib/access.ts, находка повторного ревью):
 *   KEEP_DESIGN_SYSTEM=1 NITRO_PRESET=node-server bun run build
 *   KEEP_DESIGN_SYSTEM=1 PORT=4732 node .output/server/index.mjs &
 *   SHOTS_URL=http://localhost:4732 bun scripts/gaika-shots.ts
 *
 * Снимки кладутся в GAIKA_SHOTS (по умолчанию .verify/shots/gaika) — каталог сессии вытирается,
 * поэтому путь задаётся переменной и обычно указывает в папку проекта.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env["SHOTS_URL"] ?? "http://localhost:4732";
const out = process.env["GAIKA_SHOTS"] ?? ".verify/shots/gaika";
const themes = ["dark", "light"] as const;
const widths = [375, 1440] as const;

/** Пары «текст на поверхности», которые дизайн-система обязана держать выше 4,5:1 */
const INK = ["--text", "--text-2", "--text-3", "--ember", "--sand", "--ok", "--warn", "--risk"];
const BACK = ["--bg", "--bg-elevated", "--bg-raised", "--surface-3"];

interface Pair {
  ink: string;
  back: string;
  ratio: number;
}

async function contrast(page: Page, ink: string[], back: string[]): Promise<Pair[]> {
  return page.evaluate(
    ({ ink, back }) => {
      const probe = document.createElement("div");
      document.body.append(probe);
      const rgb = (token: string) => {
        probe.style.color = `var(${token})`;
        const value = getComputedStyle(probe).color;
        const [r = 0, g = 0, b = 0] = (value.match(/[\d.]+/gu) ?? []).map(Number);
        return [r, g, b] as const;
      };
      const lum = ([r, g, b]: readonly [number, number, number]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const pairs: { ink: string; back: string; ratio: number }[] = [];
      for (const i of ink) {
        const li = lum(rgb(i));
        for (const b of back) {
          const lb = lum(rgb(b));
          const [hi, lo] = li > lb ? [li, lb] : [lb, li];
          pairs.push({ ink: i, back: b, ratio: (hi + 0.05) / (lo + 0.05) });
        }
      }
      probe.remove();
      return pairs;
    },
    { ink, back },
  );
}

const report: string[] = [];
let failures = 0;

/** Строка отчёта печатается сразу: падение в конце не должно съесть то, что уже проверено */
function say(line: string) {
  report.push(line);
  console.log(line);
}

const browser = await chromium.launch();
await mkdir(out, { recursive: true });

for (const theme of themes) {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1200 } });
    const page = await context.newPage();
    await page.addInitScript(
      ({ mode }) => {
        try {
          sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
          sessionStorage.setItem("neeklo-fieldops-persona", "e-sokolov");
          localStorage.setItem("neeklo-fieldops-theme", mode);
        } catch {
          // приватный режим: витрина откроется в теме по умолчанию
        }
      },
      { mode: theme },
    );
    await page.goto(`${base}/design-system`, { waitUntil: "domcontentloaded" });
    await page.locator("main").waitFor();
    await page.waitForTimeout(400);

    const applied = await page.evaluate(() => document.documentElement.dataset["theme"]);
    if (applied !== theme) {
      say(`✗ тема ${theme}: на странице ${String(applied)}`);
      failures += 1;
    }
    const shot = join(out, `showcase-${theme}-${width}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    say(`снимок ${shot}`);

    if (width === 1440) {
      const pairs = await contrast(page, INK, BACK);
      const bad = pairs.filter((pair) => pair.ratio < 4.5);
      say(
        `контраст ${theme}: пар ${pairs.length}, ниже AA ${bad.length}` +
          (bad.length > 0
            ? `: ${bad.map((p) => `${p.ink} на ${p.back} ${p.ratio.toFixed(2)}`).join(", ")}`
            : ""),
      );
      failures += bad.length;

      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      say(
        `axe ${theme}: серьёзных нарушений ${serious.length}` +
          (serious.length > 0 ? `: ${serious.map((v) => v.id).join(", ")}` : ""),
      );
      failures += serious.length;
    }
    await context.close();
  }
}

// prefers-reduced-motion: дыхание кнопки записи не анимируется вовсе
const quiet = await browser.newContext({
  reducedMotion: "reduce",
  viewport: { width: 375, height: 900 },
});
const page = await quiet.newPage();
await page.addInitScript(() => {
  try {
    sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
    sessionStorage.setItem("neeklo-fieldops-persona", "e-sokolov");
  } catch {
    // приватный режим
  }
});
await page.goto(`${base}/design-system`, { waitUntil: "domcontentloaded" });
await page.locator("main").waitFor();
// Кнопка записи приходит с витриной, а не с каркасом страницы: ждём именно её
await page.locator(".breathe").first().waitFor({ timeout: 10_000 });
const motion = await page.evaluate(() => {
  const node = document.querySelector(".breathe");
  if (!node) return null;
  const style = getComputedStyle(node);
  return { name: style.animationName, duration: style.animationDuration };
});
if (motion === null) {
  say("✗ reduced-motion: кнопка записи с дыханием не найдена");
  failures += 1;
} else if (motion.name !== "none") {
  say(`✗ reduced-motion: анимация ${motion.name}, длительность ${motion.duration}`);
  failures += 1;
} else {
  say("reduced-motion: дыхание выключено (animation-name: none)");
}
await quiet.close();
await browser.close();

await writeFile(join(out, "report.txt"), `${report.join("\n")}\n`, "utf8");
if (failures > 0) {
  console.error(`\nПроверка витрины не пройдена: замечаний ${failures}`);
  process.exit(1);
}
console.log("\nВитрина ГАЙКИ: обе темы, 375 и 1440, контраст AA, axe и reduced-motion в порядке");
