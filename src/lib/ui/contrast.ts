/**
 * Контраст по WCAG 2.x (ADR-052, ADR-055): разбор цвета токена, наложение полупрозрачного
 * на поверхность и отношение яркостей. Общий для scripts/check-contrast.ts, который читает
 * styles.css, и витрины /design-system, которая берёт вычисленные значения из браузера.
 */

export type RGBA = [number, number, number, number];

/** #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() и rgba(); остальное — null */
export function parseColor(raw: string): RGBA | null {
  let value = raw.trim();
  // Сборка сокращает #ffffff до #fff: витрина читает уже минифицированные значения
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(value);
  if (short)
    value = `#${short
      .slice(1)
      .filter(Boolean)
      .map((c) => c + c)
      .join("")}`;
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const parts = rgba[1]!.split(/[\s,/]+/).filter(Boolean);
    const [r, g, b, a = "1"] = parts;
    const alpha = a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
    return [Number(r), Number(g), Number(b), alpha];
  }
  return null;
}

/** Полупрозрачный цвет поверх непрозрачного */
export function over(top: RGBA, bottom: RGBA): RGBA {
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

export function ratio(a: RGBA, b: RGBA): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

export interface ContrastPair {
  fg: string;
  /** Фон: один токен или полупрозрачный поверх поверхности, «верх/низ» */
  bg: string;
  min: 4.5 | 3;
  what: string;
}

const SURFACES = ["canvas", "card", "panel-2"];
const TONES = ["mint", "amber", "coral", "sky", "lavender", "periwinkle", "teal", "pink"];
const STATUSES = ["up", "down", "caution", "note"];

/**
 * Пары, которые встречаются в интерфейсе. Текст от 4,5:1, значки, кольцо фокуса и граница
 * поля от 3:1. Список общий для проверки и витрины, поэтому витрина показывает ровно то,
 * что проверяется.
 */
export const CONTRAST_PAIRS: ContrastPair[] = [
  ...["ink", "ink-2", "ink-3"].flatMap((fg) =>
    [...SURFACES, "panel-3", "rail"].map((bg) => ({ fg, bg, min: 4.5 as const, what: "текст" })),
  ),
  { fg: "on-inverse", bg: "inverse", min: 4.5, what: "инверсная таблетка и главный показатель" },
  { fg: "on-accent", bg: "accent", min: 4.5, what: "главная кнопка" },
  { fg: "on-accent", bg: "accent-hover", min: 4.5, what: "главная кнопка, наведение" },
  ...SURFACES.map((bg) => ({ fg: "accent-text", bg, min: 4.5 as const, what: "акцент текстом" })),
  ...SURFACES.map((bg) => ({
    fg: "accent-text",
    bg: `accent-soft/${bg}`,
    min: 4.5 as const,
    what: "акцент на мягком фоне",
  })),
  { fg: "on-record", bg: "record", min: 4.5, what: "кнопка голоса во время записи" },
  { fg: "record", bg: "card", min: 4.5, what: "таймер записи" },
  // Изменение показателя и статус: текст тоном на своей плашке поверх карточки
  ...STATUSES.map((tone) => ({
    fg: tone,
    bg: `${tone}-bg/card`,
    min: 4.5 as const,
    what: "метка статуса",
  })),
  ...STATUSES.flatMap((tone) =>
    SURFACES.map((bg) => ({ fg: tone, bg, min: 4.5 as const, what: "статус текстом" })),
  ),
  // Метка палитры данных: текст тоном на своей плашке
  ...TONES.flatMap((tone) =>
    ["card", "panel-2"].map((bg) => ({
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
  ...["card", "panel-2"].map((bg) => ({
    fg: "field-line",
    bg,
    min: 3 as const,
    what: "граница поля",
  })),
  ...SURFACES.map((bg) => ({ fg: "ink-3", bg, min: 3 as const, what: "значок" })),
];

/**
 * Отношение для пары: lookup отдаёт цвет токена по имени (без «--»). Полупрозрачный фон без
 * явной поверхности ложится на холст.
 */
export function pairRatio(pair: ContrastPair, lookup: (name: string) => RGBA): number {
  const [top, bottom] = pair.bg.split("/");
  const t = lookup(top!);
  const bg = bottom ? over(t, lookup(bottom)) : t[3] < 1 ? over(t, lookup("canvas")) : t;
  const fg = over(lookup(pair.fg), bg);
  return ratio(fg, bg);
}
