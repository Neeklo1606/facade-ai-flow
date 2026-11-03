/**
 * Кнопки времени бота и формы бригадира (ADR-061, 9). Начало 06:00–20:00 по часу, окончание
 * от начала + 30 мин до 23:00 по получасу, остальное — «Своё время» сообщением.
 *
 * Занятость больше не выключает кнопку: время, уже внесённое бригадой за день, — подпись
 * на кнопке. Пересечение станет признаком записи для менеджера (раздел 4.1).
 */
import { formatClock } from "./calc";
import type { BusyInterval } from "./view";

const HALF_HOUR = 30;
const HOUR = 60;
export const START_FROM = 6 * HOUR;
export const START_TO = 20 * HOUR;
export const END_TO = 23 * HOUR;
/** Окончание не раньше начала + 30 минут */
export const MIN_SPAN = 30;

export interface TimeSlot {
  minutes: number;
  label: string;
  /** Запись бригады, в которую попадает время: подсказка, кнопка доступна */
  busy: BusyInterval | null;
}

/** Время внутри уже внесённой записи бригады за день */
export function busyAt(busy: readonly BusyInterval[], minute: number): BusyInterval | null {
  return busy.find((b) => minute >= b.start && minute < b.end) ?? null;
}

/** Интервал, с которым пересекается [start, end): первый найденный или null */
export function busyClash(
  busy: readonly BusyInterval[],
  start: number,
  end: number,
): BusyInterval | null {
  return busy.find((b) => Math.min(end, b.end) - Math.max(start, b.start) > 0) ?? null;
}

export function startSlots(busy: readonly BusyInterval[]): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let m = START_FROM; m <= START_TO; m += HOUR) {
    slots.push({ minutes: m, label: formatClock(m), busy: busyAt(busy, m) });
  }
  return slots;
}

/** Окончание: начало + 30 мин, дальше по сетке получаса до 23:00 */
export function endSlots(busy: readonly BusyInterval[], start: number): TimeSlot[] {
  const first = start + MIN_SPAN;
  const values: number[] = [];
  if (first <= END_TO) values.push(first);
  for (let m = Math.ceil((first + 1) / HALF_HOUR) * HALF_HOUR; m <= END_TO; m += HALF_HOUR) {
    values.push(m);
  }
  return values.map((m) => ({
    minutes: m,
    label: formatClock(m),
    busy: busyClash(busy, start, m),
  }));
}

export function intervalLabel(start: number, end: number): string {
  return `${formatClock(start)}–${formatClock(end)}`;
}

/** «уже внесено: 08:10–11:40, ОБ-101» — строка над полем времени */
export function busyLine(busy: readonly (BusyInterval & { objectLabel?: string })[]): string {
  return `уже внесено: ${busy
    .map((b) => `${intervalLabel(b.start, b.end)}${b.objectLabel ? `, ${b.objectLabel}` : ""}`)
    .join("; ")}`;
}
