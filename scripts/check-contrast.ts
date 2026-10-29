/**
 * Контраст «Монохрома» в обеих темах (ADR-052, ADR-055). Значения берутся из src/styles.css:
 * блок `:root` (тёмная тема) и `:root[data-theme="light"]` (светлая поверх тёмной).
 *
 * Пороги: текст от 4,5:1, значки и границы полей от 3:1. Полупрозрачный фон (метка, мягкий
 * акцент) накладывается на поверхность, на которой он лежит в интерфейсе. Пары и расчёт общие
 * с витриной /design-system: src/lib/ui/contrast.ts. Скрипт печатает каждую пару и падает,
 * если хоть одна ниже порога. Запуск: `bun scripts/check-contrast.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRAST_PAIRS,
  over,
  pairRatio,
  parseColor,
  ratio,
  type RGBA,
} from "../src/lib/ui/contrast";

const css = readFileSync(join(import.meta.dir, "..", "src", "styles.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Нет блока ${selector}`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const dark = block(":root");
const light = { ...dark, ...block(':root[data-theme="light"]') };

function resolve(tokens: Record<string, string>, name: string, depth = 0): RGBA {
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`Нет токена --${name}`);
  const ref = /^var\(--([\w-]+)\)$/.exec(raw);
  if (ref) {
    if (depth > 10) throw new Error(`Цикл в --${name}`);
    return resolve(tokens, ref[1]!, depth + 1);
  }
  const color = parseColor(raw);
  if (!color) throw new Error(`--${name}: значение «${raw}» не цвет`);
  return color;
}

let failed = 0;
for (const [theme, tokens] of [
  ["тёмная", dark],
  ["светлая", light],
] as const) {
  console.log(`\n${theme} тема`);
  for (const p of CONTRAST_PAIRS) {
    const r = pairRatio(p, (name) => resolve(tokens, name));
    const ok = r >= p.min;
    if (!ok) failed++;
    console.log(
      `  ${ok ? "да " : "НЕТ"} ${r.toFixed(2).padStart(5)}:1 (от ${p.min}) ${p.what}: --${p.fg} на ${p.bg
        .split("/")
        .map((x) => `--${x}`)
        .join(" поверх ")}`,
    );
  }
}

// Поле выделяется фоном panel-2 на карточке, граница справочно
for (const [theme, tokens] of [
  ["тёмная", dark],
  ["светлая", light],
] as const) {
  const bg = resolve(tokens, "card");
  const field = over(resolve(tokens, "panel-2"), bg);
  console.log(`\n${theme}: поле panel-2 на card ${ratio(field, bg).toFixed(2)}:1 (справочно)`);
}

if (failed > 0) {
  console.error(`\nКонтраст ниже порога: ${failed} пар`);
  process.exit(1);
}
console.log("\nКонтраст «Монохрома»: все пары выше порога");
