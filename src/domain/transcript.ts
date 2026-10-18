import type { Transcript } from "@/contracts";

/**
 * Расшифровка по словам (ADR-040, п. 2). Живой распознаватель отдаёт интервалы сам; для
 * подготовленной расшифровки показа интервалы считаются здесь — детерминированно, чтобы показ
 * каждый раз выглядел одинаково и проверялся тестом.
 */

/** Слова с интервалами: длительность слова растёт с его длиной, паузы после знаков препинания */
export function wordTimings(text: string, durationMs: number): Transcript["segments"] {
  const words = text.split(/\s+/u).filter(Boolean);
  if (!words.length) return [];
  const weight = (word: string) => 2 + word.replace(/[^\p{L}\p{N}]/gu, "").length;
  const pause = (word: string) => (/[.,;:!?]$/u.test(word) ? 3 : 0);
  const total = words.reduce((sum, word) => sum + weight(word) + pause(word), 0);
  const unit = Math.max(1, durationMs) / total;
  let at = 0;
  return words.map((word) => {
    const startMs = Math.round(at);
    at += weight(word) * unit;
    const endMs = Math.round(at);
    at += pause(word) * unit;
    return { text: word, startMs, endMs };
  });
}

/**
 * Ускоренный показ слов: вся расшифровка проявляется за `targetMs` (1,5–2,5 с), сохраняя ритм
 * речи. Возвращает момент появления каждого слова от начала показа.
 */
export function revealSchedule(segments: Transcript["segments"], targetMs = 2_000): number[] {
  if (!segments.length) return [];
  const end = Math.max(1, segments[segments.length - 1]!.endMs);
  const scale = Math.min(1, targetMs / end);
  return segments.map((segment) => Math.round(segment.startMs * scale));
}

/** Сколько слов видно через `elapsedMs` после начала показа */
export function visibleWords(schedule: number[], elapsedMs: number) {
  let count = 0;
  for (const at of schedule) if (at <= elapsedMs) count++;
  return count;
}

/**
 * Фрагмент источника в расшифровке: где стоит фраза, из которой взято значение. Сравнение без
 * учёта регистра и «ё»; не нашлось — `null`, и экран показывает фразу целиком без выделения.
 */
export function locateQuote(
  text: string,
  quote: string | null,
): { start: number; end: number } | null {
  if (!quote) return null;
  const norm = (value: string) => value.toLowerCase().replace(/ё/gu, "е");
  const start = norm(text).indexOf(norm(quote.trim()));
  return start < 0 ? null : { start, end: start + quote.trim().length };
}
