/**
 * Размеры снимков продукта в public/site/shots (ADR-067, раздел 7.2). Файл пишет
 * `bun run site:shots`, руками не править. Нет строки: снимка нет, сайт показывает живой
 * фрагмент.
 */
export const SHOT_SIZES: Record<string, { w: number; h: number; widths: readonly number[] }> = {
  "docs-act": { w: 1200, h: 820, widths: [640, 960, 1440] },
  "docs-materials": { w: 1200, h: 760, widths: [640, 960, 1440] },
  "docs-package": { w: 1200, h: 820, widths: [640, 960, 1440] },
  "docs-registry": { w: 1200, h: 560, widths: [640, 960, 1440] },
  "supply-offers": { w: 1128, h: 253, widths: [640, 960, 1440] },
  "supply-overview": { w: 1200, h: 820, widths: [640, 960, 1440] },
  "supply-receive": { w: 390, h: 780, widths: [640] },
  "supply-request": { w: 390, h: 442, widths: [640] },
  "time-brigade": { w: 390, h: 760, widths: [640] },
  "time-review": { w: 1200, h: 820, widths: [640, 960, 1440] },
  "time-tabel": { w: 1200, h: 760, widths: [640, 960, 1440] },
  "time-week": { w: 1200, h: 820, widths: [640, 960, 1440] },
};
