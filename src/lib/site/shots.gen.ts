/**
 * Размеры снимков продукта в public/site/shots (ADR-067, раздел 7.2). Файл пишет
 * `bun run site:shots`, руками не править. Нет строки: снимка нет, сайт показывает живой
 * фрагмент.
 */
export const SHOT_SIZES: Record<string, { w: number; h: number; widths: readonly number[] }> = {};
