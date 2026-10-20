/**
 * Время в боте бригадира (ADR-044, F4): кнопки с шагом 30 минут, ручной ввод сообщением
 * и проверка пересечения сразу на шаге времени, а не на последнем шаге.
 */
import { clashOf, formatClock, type BusyInterval } from "@/api/gas-ops";

const HALF_HOUR = 30;
/** Кнопки начала: с 07:00 до 12:00 */
const START_FROM = 7 * 60;
const START_TO = 12 * 60;
/** Кнопки окончания: до 19:00 */
const END_TO = 19 * 60;

/**
 * Маска ЧЧ:ММ для ответа сообщением: «8:20», «8.20», «08 20», «0820» и «820» дают «08:20».
 * Возвращает минуты от полуночи или null, если это не время.
 */
export function parseTypedClock(text: string): number | null {
  const value = text.trim();
  let hours: number;
  let minutes: number;
  const split = /^(\d{1,2})\s*[.:,\s]\s*(\d{2})$/.exec(value);
  const bare = /^(\d{3,4})$/.exec(value);
  const hourOnly = /^(\d{1,2})$/.exec(value);
  if (split) {
    hours = Number(split[1]);
    minutes = Number(split[2]);
  } else if (bare) {
    const digits = bare[1]!.padStart(4, "0");
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2));
  } else if (hourOnly) {
    hours = Number(hourOnly[1]);
    minutes = 0;
  } else {
    return null;
  }
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Поле ответа пропускает только цифры и разделители, не длиннее «08:20» */
export function maskClockDraft(text: string): string {
  return text.replace(/[^\d.:,]/g, "").slice(0, 5);
}

export interface TimeSlot {
  minutes: number;
  label: string;
  /** Запись бригады, с которой кнопка пересекается: такая кнопка недоступна */
  busy: BusyInterval | null;
}

/** Начало занято, если попадает внутрь уже внесённой записи бригады за этот день */
export function busyAt(busy: BusyInterval[], minute: number): BusyInterval | null {
  return busy.find((b) => minute >= b.start && minute < b.end) ?? null;
}

export function startSlots(busy: BusyInterval[]): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let m = START_FROM; m <= START_TO; m += HALF_HOUR) {
    slots.push({ minutes: m, label: formatClock(m), busy: busyAt(busy, m) });
  }
  return slots;
}

/** Окончание: от начала +1 ч, дальше по сетке 30 минут до 19:00 */
export function endSlots(busy: BusyInterval[], start: number): TimeSlot[] {
  const first = start + 60;
  const values: number[] = [];
  if (first <= END_TO) values.push(first);
  for (let m = Math.ceil((first + 1) / HALF_HOUR) * HALF_HOUR; m <= END_TO; m += HALF_HOUR) {
    values.push(m);
  }
  return values.map((m) => ({ minutes: m, label: formatClock(m), busy: clashOf(busy, start, m) }));
}

export function intervalLabel(start: number, end: number): string {
  return `${formatClock(start)}–${formatClock(end)}`;
}
