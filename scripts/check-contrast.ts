/**
 * Контраст «Графита» в обеих темах (ADR-052, раздел 1). Значения берутся из src/styles.css:
 * блок `:root` (тёмная тема) и `:root[data-theme="light"]` (светлая поверх тёмной).
 *
 * Пороги: текст от 4,5:1, значки и границы полей от 3:1. Полупрозрачный фон (метка, мягкий
 * акцент) накладывается на поверхность, на которой он лежит в интерфейсе. Скрипт печатает
 * каждую пару и падает, если хоть одна ниже порога. Запуск: `bun scripts/check-contrast.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

type RGBA = [number, number, number, number];

function resolve(tokens: Record<string, string>, name: string, depth = 0): RGBA {
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`Нет токена --${name}`);
  const ref = /^var\(--([\w-]+)\)$/.exec(raw);
  if (ref) {
    if (depth > 10) throw new Error(`Цикл в --${name}`);
    return resolve(tokens, ref[1]!, depth + 1);
  }
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(raw);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(raw);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1]!.split(",").map((x) => x.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`--${name}: значение «${raw}» не цвет`);
}

function over(top: RGBA, bottom: RGBA): RGBA {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}

function luminance([r, g, b]: RGBA): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function ratio(a: RGBA, b: RGBA): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

interface Pair {
  fg: string;
  /** Фон: один токен или полупрозрачный поверх поверхности «верх/низ» */
  bg: string;
  min: 4.5 | 3;
  what: string;
}

const SURFACES = ["canvas", "panel", "panel-2"];
const TONES = ["mint", "amber", "coral", "sky", "lavender", "periwinkle", "teal", "pink"];

const pairs: Pair[] = [
  ...["ink", "ink-2", "ink-3"].flatMap((fg) =>
    [...SURFACES, "panel-3", "rail"].map((bg) => ({ fg, bg, min: 4.5 as const, what: "текст" })),
  ),
  { fg: "on-accent", bg: "accent", min: 4.5, what: "главная кнопка" },
  { fg: "on-accent", bg: "accent-hover", min: 4.5, what: "главная кнопка, наведение" },
  ...SURFACES.map((bg) => ({ fg: "accent-text", bg, min: 4.5 as const, what: "акцент текстом" })),
  ...SURFACES.map((bg) => ({
    fg: "accent-text",
    bg: `accent-soft/${bg}`,
    min: 4.5 as const,
    what: "акцент на мягком фоне",
  })),
  { fg: "on-accent", bg: "accent-text", min: 4.5, what: "заливка цветом текста-акцента" },
  // Метка: текст тоном на своей плашке поверх панели
  ...TONES.flatMap((tone) =>
    ["panel", "panel-2"].map((bg) => ({
      fg: tone,
      bg: `${tone}-soft/${bg}`,
      min: 4.5 as const,
      what: "метка",
    })),
  ),
  ...TONES.flatMap((tone) =>
    SURFACES.map((bg) => ({ fg: tone, bg, min: 4.5 as const, what: "тон текстом" })),
  ),
  // Значки и фокус: от 3:1
  ...SURFACES.map((bg) => ({ fg: "accent-text", bg, min: 3 as const, what: "кольцо фокуса" })),
  ...["panel", "panel-2"].map((bg) => ({
    fg: "field-line",
    bg,
    min: 3 as const,
    what: "граница поля",
  })),
  ...SURFACES.map((bg) => ({ fg: "ink-3", bg, min: 3 as const, what: "значок" })),
];

function colorOf(tokens: Record<string, string>, spec: string): RGBA {
  const [top, bottom] = spec.split("/");
  const t = resolve(tokens, top!);
  if (!bottom) return t[3] < 1 ? over(t, resolve(tokens, "canvas")) : t;
  return over(t, resolve(tokens, bottom));
}

let failed = 0;
for (const [theme, tokens] of [
  ["тёмная", dark],
  ["светлая", light],
] as const) {
  console.log(`\n${theme} тема`);
  for (const p of pairs) {
    const bg = colorOf(tokens, p.bg);
    const fg = over(resolve(tokens, p.fg), bg);
    const r = ratio(fg, bg);
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

// Граница поля ввода: line-2 видна на панели от 3:1 по WCAG 1.4.11 только для полей с рамкой.
// В «Графите» поле выделяется фоном panel-2 на panel, поэтому граница здесь только печатается.
for (const [theme, tokens] of [
  ["тёмная", dark],
  ["светлая", light],
] as const) {
  const bg = resolve(tokens, "panel");
  const field = over(resolve(tokens, "panel-2"), bg);
  console.log(`\n${theme}: поле panel-2 на panel ${ratio(field, bg).toFixed(2)}:1 (справочно)`);
}

if (failed > 0) {
  console.error(`\nКонтраст ниже порога: ${failed} пар`);
  process.exit(1);
}
console.log("\nКонтраст «Графита»: все пары выше порога");
