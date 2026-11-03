/**
 * Новая запись среди уже внесённых (ADR-061, 9; раздел 4.1). Одна функция для формы,
 * бота и порта, чтобы они не расходились:
 * - полное совпадение (бригада, объект, дата, интервал) — блок, предлагается открыть запись;
 * - пересечение с другой записью бригады — признак для менеджера, не запрет;
 * - тот же объект в тот же день с другим интервалом — «повторный выезд», тоже признак.
 * Касание встык (08:00–12:00 и 12:00–17:00) — не пересечение.
 */
import { formatClock } from "./calc";
import type { EntryFlag, TimeEntry } from "./model";

export interface EntryCandidate {
  /** Исправляемая запись: с собой она не сравнивается */
  id?: string | null;
  brigadeId: string;
  objectId: string;
  day: string;
  start: number | null;
  end: number | null;
}

export interface EntryCheck<T = TimeEntry> {
  /** Такая же запись уже есть: вторую не принимаем */
  twin: T | null;
  overlaps: { entry: T; minutes: number }[];
  /** Записи того же объекта за день с другим интервалом */
  repeatVisits: T[];
}

type Comparable = Pick<
  TimeEntry,
  "id" | "brigadeId" | "objectId" | "day" | "startMinutes" | "endMinutes" | "status"
>;

function sameDay<T extends Comparable>(entries: readonly T[], c: EntryCandidate): T[] {
  return entries.filter(
    (e) =>
      e.id !== c.id && e.status !== "rejected" && e.brigadeId === c.brigadeId && e.day === c.day,
  );
}

export function checkEntry<T extends Comparable>(
  entries: readonly T[],
  candidate: EntryCandidate,
): EntryCheck<T> {
  const day = sameDay(entries, candidate);
  const { start, end } = candidate;
  const framed = start !== null && end !== null;
  const sameObject = day.filter((e) => e.objectId === candidate.objectId);
  const twin =
    sameObject.find((e) => e.startMinutes === start && e.endMinutes === end) ??
    // Без рамки смены интервал неизвестен: совпадение объекта и дня считаем полным
    (framed ? null : (sameObject[0] ?? null));
  const overlaps = framed
    ? day
        .filter((e) => e !== twin && e.startMinutes !== null && e.endMinutes !== null)
        .map((e) => ({
          entry: e,
          minutes: Math.min(end, e.endMinutes!) - Math.max(start, e.startMinutes!),
        }))
        .filter((o) => o.minutes > 0)
    : [];
  const repeatVisits = twin ? [] : sameObject;
  return { twin, overlaps, repeatVisits };
}

/** Признаки, с которыми запись уйдёт менеджеру */
export function checkFlags(
  check: Pick<EntryCheck<unknown>, "overlaps" | "repeatVisits">,
): EntryFlag[] {
  const flags: EntryFlag[] = [];
  if (check.overlaps.length) flags.push("overlap");
  if (check.repeatVisits.length) flags.push("repeat-visit");
  return flags;
}

/** «08:10–11:40» записи; без рамки смены — минуты */
export function entryFrame(e: Pick<TimeEntry, "startMinutes" | "endMinutes" | "minutes">): string {
  return e.startMinutes !== null && e.endMinutes !== null
    ? `${formatClock(e.startMinutes)}–${formatClock(e.endMinutes)}`
    : `${e.minutes} мин`;
}
