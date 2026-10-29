/**
 * Состав бригады, человеко-часы и ставки (ADR-056, раздел 1.2 Сервиса v1).
 *
 * Время не равно выработке: часы записи — рамка смены минус перерыв, человеко-часы — часы
 * каждого человека суммой. В отчёте заказчика состава нет, поэтому у его строк человеко-часы
 * неизвестны и не приравниваются к часам. Стоимость труда считается только по заданным
 * ставкам: без ставки — null и честная метка «Ставки не заданы», а не ноль.
 */
import { effectiveMinutes, MINUTES_ERROR_TEXT, MINUTES_IN_HOUR } from "./calc";
import type { DataSource, PersonTime, TimeEntry } from "./model";

/** Человек в составе бригады с периодом действия; `from: null` — с начала учёта */
export interface CrewMember {
  id: string;
  brigadeId: string;
  employeeId: string;
  name: string;
  role: "lead" | "worker";
  from: string | null;
  /** Последний день в составе включительно; null — состоит сейчас */
  to: string | null;
  source: DataSource;
}

export const CREW_ROLE_LABEL: Record<CrewMember["role"], string> = {
  lead: "Бригадир",
  worker: "Монтажник",
};

/** Ставка за час с периодом действия: на человека или на всю бригаду */
export interface Rate {
  id: string;
  employeeId: string | null;
  brigadeId: string | null;
  /** Целые рубли за час человека */
  rubPerHour: number;
  from: string;
  to: string | null;
  source: DataSource;
}

function inPeriod(day: string, from: string | null, to: string | null): boolean {
  return (from === null || from <= day) && (to === null || day <= to);
}

/** Состав бригады на дату: кто числится в этот день */
export function crewOn(
  members: readonly CrewMember[],
  brigadeId: string,
  day: string,
): CrewMember[] {
  return members.filter((m) => m.brigadeId === brigadeId && inPeriod(day, m.from, m.to));
}

/** Число людей по умолчанию: весь состав на дату; состава нет — null, а не единица */
export function defaultHeadcount(
  members: readonly CrewMember[],
  brigadeId: string,
  day: string,
): number | null {
  const crew = crewOn(members, brigadeId, day);
  return crew.length > 0 ? crew.length : null;
}

/**
 * Человеко-минуты записи. Строки людей — их сумма; число людей — минуты записи на число;
 * состав неизвестен (строка из выгрузки заказчика) — null
 */
export function manMinutesOf(
  entry: Pick<TimeEntry, "minutes" | "headcount" | "people">,
): number | null {
  if (entry.people && entry.people.length > 0) {
    return entry.people.reduce((a, p) => a + p.minutes, 0);
  }
  if (entry.headcount === null || entry.headcount === undefined || entry.headcount <= 0)
    return null;
  return entry.minutes * entry.headcount;
}

/** Сколько людей в записи: строки людей или число; неизвестно — null */
export function headcountOf(entry: Pick<TimeEntry, "headcount" | "people">): number | null {
  if (entry.people && entry.people.length > 0) return entry.people.length;
  return entry.headcount ?? null;
}

export interface PersonInput {
  employeeId: string;
  start: string | number;
  end: string | number;
  breakMinutes: string | number;
}

export type PeopleResult =
  { ok: true; people: PersonTime[] } | { ok: false; index: number; message: string };

/** Строки людей «у сотрудников разное время»: каждая считается тем же правилом, что запись */
export function personRows(rows: readonly PersonInput[]): PeopleResult {
  const people: PersonTime[] = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (seen.has(row.employeeId)) {
      return { ok: false, index, message: "Этот человек уже есть в списке." };
    }
    seen.add(row.employeeId);
    const result = effectiveMinutes({
      start: row.start,
      end: row.end,
      breakMinutes: row.breakMinutes,
    });
    if (!result.ok) return { ok: false, index, message: MINUTES_ERROR_TEXT[result.error] };
    people.push({
      employeeId: row.employeeId,
      startMinutes: result.startMinutes,
      endMinutes: result.endMinutes,
      breakMinutes: result.breakMinutes,
      minutes: result.minutes,
    });
  }
  return { ok: true, people };
}

/**
 * Рамка записи по строкам людей: начало самого раннего, окончание самого позднего,
 * минуты записи — самая длинная смена. Так пересечения бригады проверяются по рамке
 */
export function frameOfPeople(people: readonly PersonTime[]): {
  startMinutes: number;
  endMinutes: number;
  breakMinutes: number;
  minutes: number;
} | null {
  if (people.length === 0) return null;
  const longest = people.reduce((a, p) => (p.minutes > a.minutes ? p : a));
  return {
    startMinutes: Math.min(...people.map((p) => p.startMinutes)),
    endMinutes: Math.max(...people.map((p) => p.endMinutes)),
    breakMinutes: longest.breakMinutes,
    minutes: longest.minutes,
  };
}

/** Ставка на дату: ставка человека важнее ставки бригады */
export function rateOn(
  rates: readonly Rate[],
  who: { employeeId: string | null; brigadeId: string },
  day: string,
): Rate | null {
  const active = rates.filter((r) => inPeriod(day, r.from, r.to));
  return (
    (who.employeeId ? active.find((r) => r.employeeId === who.employeeId) : undefined) ??
    active.find((r) => r.employeeId === null && r.brigadeId === who.brigadeId) ??
    null
  );
}

/**
 * Стоимость труда записи, целые рубли: человеко-часы × ставка. Не хватает ставки хоть
 * для одного человека или неизвестен состав — null: частичная сумма выглядела бы полной
 */
export function laborCostOf(entry: TimeEntry, rates: readonly Rate[]): number | null {
  if (entry.people && entry.people.length > 0) {
    let total = 0;
    for (const person of entry.people) {
      const rate = rateOn(
        rates,
        { employeeId: person.employeeId, brigadeId: entry.brigadeId },
        entry.day,
      );
      if (!rate) return null;
      total += (person.minutes / MINUTES_IN_HOUR) * rate.rubPerHour;
    }
    return Math.round(total);
  }
  const manMinutes = manMinutesOf(entry);
  const rate = rateOn(rates, { employeeId: null, brigadeId: entry.brigadeId }, entry.day);
  if (manMinutes === null || !rate) return null;
  return Math.round((manMinutes / MINUTES_IN_HOUR) * rate.rubPerHour);
}

/** «8 ч на человека, всего 40 чел.-ч»: сводка проверки перед отправкой */
export function crewSummary(entry: Pick<TimeEntry, "minutes" | "headcount" | "people">): string {
  const people = headcountOf(entry);
  const man = manMinutesOf(entry);
  if (people === null || man === null) return "Состав не указан";
  const each =
    entry.people && entry.people.length > 0
      ? "разное время"
      : `по ${fmtManHours(entry.minutes, "ч")} на человека`;
  return `${people} чел., ${each}, всего ${fmtManHours(man, "чел.-ч")}`;
}

/** «40 чел.-ч», «7,5 ч»: десятичные только когда они есть */
export function fmtManHours(minutes: number, unit: "ч" | "чел.-ч"): string {
  const hours = minutes / MINUTES_IN_HOUR;
  const text = hours.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return `${text}\u00a0${unit}`;
}
