/**
 * Поле «Время работы» бригадира (ADR-061, 9): одна строка вместо двух масок. Разбирает время
 * и диапазон цифрами, словами — через `parseTimeMessage`. Неуверенный разбор помечается
 * `confirm`: интерфейс переспрашивает, а не угадывает молча (раздел 4.1).
 *
 * «8», «8.20», «820», «0820», «8:20», «8 20» — одно время; «16.4» — 16:40 (десятки минут);
 * «8,5» — 08:30 (десятичные часы, с переспросом); «8-17», «с 8:30 до 16», «830-1700»,
 * «8:00–17:00», «с восьми до пяти» — диапазон.
 */
import { formatClock, MINUTES_IN_HOUR } from "./calc";
import { parseTimeMessage } from "./parse-time-message";

export type TimeInputError = "empty" | "not-time" | "overnight";

export type TimeInput =
  | { kind: "range"; start: number; end: number; confirm: boolean }
  | { kind: "clock"; minutes: number; confirm: boolean }
  | { kind: "error"; reason: TimeInputError; start?: number; end?: number };

export const TIME_INPUT_TEXT: Record<TimeInputError, string> = {
  empty: "Напишите время работы, например 8-17.",
  "not-time": "Не понял время. Напишите так: 8-17, с 8:30 до 16 или 830-1700.",
  overnight: "Окончание раньше начала. Работа через полночь? Такие смены пока вносит менеджер.",
};

const HALF_DAY = 12 * MINUTES_IN_HOUR;

function clock(hours: number, minutes: number): number | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * MINUTES_IN_HOUR + minutes;
}

/** Одно время цифрами. `confirm` — разбор возможен, но не единственный */
export function parseClockToken(raw: string): { minutes: number; confirm: boolean } | null {
  const value = raw.trim();
  let m = /^(\d{1,2})$/.exec(value);
  if (m) return wrap(clock(Number(m[1]), 0), false);
  // «8:20», «8.20», «8 20», «8,20»
  m = /^(\d{1,2})\s*[:.,\s]\s*(\d{2})$/.exec(value);
  if (m) return wrap(clock(Number(m[1]), Number(m[2])), false);
  // «16.4» и «16:4»: одна цифра после точки — десятки минут
  m = /^(\d{1,2})[.:](\d)$/.exec(value);
  if (m) return wrap(clock(Number(m[1]), Number(m[2]) * 10), false);
  // «8,5»: так пишут часы дробью — 08:30, но переспрашиваем
  m = /^(\d{1,2}),(\d)$/.exec(value);
  if (m) return wrap(clock(Number(m[1]), Number(m[2]) * 6), true);
  // «820», «0820», «1700»
  m = /^(\d{3,4})$/.exec(value);
  if (m) {
    const digits = m[1]!.padStart(4, "0");
    return wrap(clock(Number(digits.slice(0, 2)), Number(digits.slice(2))), false);
  }
  return null;
}

function wrap(minutes: number | null, confirm: boolean) {
  return minutes === null ? null : { minutes, confirm };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
}

/** Диапазон с окончанием в 12-часовом счёте: «с 8 до 5» — до 17:00, с переспросом */
function range(start: number, end: number, confirm: boolean): TimeInput {
  let to = end;
  let unsure = confirm;
  if (to <= start && start <= HALF_DAY && to < HALF_DAY && to + HALF_DAY > start) {
    to += HALF_DAY;
    unsure = true;
  }
  if (to <= start) return { kind: "error", reason: "overnight", start, end };
  return { kind: "range", start, end: to, confirm: unsure };
}

export function parseTimeInput(text: string): TimeInput {
  const value = normalize(text);
  if (!value) return { kind: "error", reason: "empty" };

  const single = parseClockToken(value);
  if (single) return { kind: "clock", ...single };

  const pair = /^(?:с|со)?\s*(.+?)\s*(?:-|до|по)\s*(.+?)$/.exec(value);
  if (pair) {
    const start = parseClockToken(pair[1]!);
    const end = parseClockToken(pair[2]!);
    if (start && end) return range(start.minutes, end.minutes, start.confirm || end.confirm);
  }

  // Словами: «с восьми до пяти», «с половины девятого до шести» — правило разбора фразы
  const phrase = parseTimeMessage(value, [], "2000-01-01");
  // Только время целиком: фраза с адресом или днём — дело `parseTimeMessage` у вызывающего
  let rest = value;
  for (const quote of [phrase.quotes.start, phrase.quotes.end])
    if (quote) rest = rest.replace(quote, " ");
  if (rest.replace(/(^|\s)(с|со)(?=\s|$)/g, " ").replace(/[\s,.!?-]/g, "") !== "")
    return { kind: "error", reason: "not-time" };
  if (phrase.start !== null && phrase.end !== null)
    return { kind: "range", start: phrase.start, end: phrase.end, confirm: false };
  if (phrase.start !== null && phrase.reasons.end)
    return { kind: "error", reason: "overnight", start: phrase.start };
  return { kind: "error", reason: "not-time" };
}

/** «08:00–17:00 · 9 ч 00 мин»: расшифровка под полем, длительность рамки без перерыва */
export function rangeLabel(start: number, end: number): string {
  const span = end - start;
  const h = Math.floor(span / MINUTES_IN_HOUR);
  const m = String(span % MINUTES_IN_HOUR).padStart(2, "0");
  return `${formatClock(start)}–${formatClock(end)} · ${h} ч ${m} мин`;
}

/** «4 ч», «8 ч 30 мин»: длительность для переспроса бота */
export function spanLabel(minutes: number): string {
  const h = Math.floor(minutes / MINUTES_IN_HOUR);
  const m = minutes % MINUTES_IN_HOUR;
  if (h === 0) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
