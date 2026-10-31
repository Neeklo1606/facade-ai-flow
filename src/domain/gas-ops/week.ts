/**
 * Неделя руководителя (ADR-056): показатели 1.2, полнота отчётов по графику, причины,
 * которые мешают закрыть неделю, и версии закрытого периода (инварианты 1.4, 1–3).
 *
 * Закрытие фиксирует копию подтверждённых записей — версию v1. Закрытая неделя не меняется:
 * правка, решение проверки и новая запись на её дни отклоняются. Переоткрытие с причиной
 * снимает замок, но v1 со своими записями и итогом остаётся; следующее закрытие даёт v2.
 */
import { findOverlaps, revenuePerHour } from "./calc";
import { crewOn, headcountOf, laborCostOf, manMinutesOf, type CrewMember, type Rate } from "./crew";
import type { Assignment, Brigade, Estimate, TimeEntry, WorkObject } from "./model";
import { finalCheckList, type FinalCheck } from "./review-policy";
import { scheduleObjectIds, type ScheduleRow } from "./schedule";

/* ---------------------------------------------------------------- Показатели */

export interface WeekMetrics {
  /** Подтверждённое начисление по смете, целые рубли (инвариант 1: только подтверждённое) */
  accruedRub: number;
  /** Часы записей: рамка минус перерыв, подтверждённые */
  minutes: number;
  /** Человеко-минуты по записям с известным составом */
  manMinutes: number;
  /** Подтверждённых записей без состава: человеко-часы по ним неизвестны */
  withoutCrew: number;
  /** Выработка на час бригады: начислено / часы записи; нет часов — null */
  outputPerHour: number | null;
  /** Выработка на человеко-час: только по записям с составом и суммой */
  outputPerManHour: number | null;
  /** Стоимость труда: null, если ставок нет или хоть одной записи не хватает ставки */
  laborCostRub: number | null;
  ratesSet: boolean;
  confirmed: number;
  pending: number;
  clarify: number;
}

export function weekMetrics(
  entries: readonly TimeEntry[],
  days: readonly string[],
  rates: readonly Rate[],
): WeekMetrics {
  const week = new Set(days);
  const own = entries.filter((e) => week.has(e.day));
  const confirmed = own.filter((e) => e.status === "confirmed");
  const accruedRub = confirmed.reduce((a, e) => a + (e.amountRub ?? 0), 0);
  const minutes = confirmed.reduce((a, e) => a + e.minutes, 0);
  const withCrew = confirmed.filter((e) => manMinutesOf(e) !== null);
  const manMinutes = withCrew.reduce((a, e) => a + (manMinutesOf(e) ?? 0), 0);
  const manAccrued = withCrew.reduce((a, e) => a + (e.amountRub ?? 0), 0);
  const costs = confirmed.map((e) => laborCostOf(e, rates));
  return {
    accruedRub,
    minutes,
    manMinutes,
    withoutCrew: confirmed.length - withCrew.length,
    outputPerHour: revenuePerHour(accruedRub, minutes),
    outputPerManHour: revenuePerHour(manAccrued, manMinutes),
    laborCostRub:
      rates.length === 0 || confirmed.length === 0 || costs.some((c) => c === null)
        ? null
        : costs.reduce<number>((a, c) => a + (c ?? 0), 0),
    ratesSet: rates.length > 0,
    confirmed: confirmed.length,
    pending: own.filter((e) => e.status === "pending").length,
    clarify: own.filter((e) => e.status === "clarify").length,
  };
}

/** Начислено по дням: подтверждённое; день без записей — null, а не ноль (разрыв графика) */
export function accruedByDay(
  entries: readonly TimeEntry[],
  days: readonly string[],
): { day: string; value: number | null }[] {
  return days.map((day) => {
    const own = entries.filter((e) => e.day === day && e.status === "confirmed");
    return { day, value: own.length ? own.reduce((a, e) => a + (e.amountRub ?? 0), 0) : null };
  });
}

/* ---------------------------------------------------------------- Ожидание */

/** Бригада × день × объект, где запись ожидается: из графика заказчика или демо-назначений */
export interface Expectation {
  key: string;
  brigadeId: string;
  day: string;
  objectId: string;
  source: "schedule" | "assignment";
}

export interface ExpectationInput {
  days: readonly string[];
  brigades: readonly Pick<Brigade, "id" | "code" | "name">[];
  objects: readonly Pick<WorkObject, "id" | "code" | "label">[];
  schedule: { rows: ScheduleRow[] } | null | undefined;
  assignments: readonly Assignment[];
}

/**
 * Что ожидается за неделю. Есть график заказчика — только он; нет — демо-назначения
 * (их источник виден на экране). Ничего нет — пусто, и полнота недели не считается
 */
export function expectations(input: ExpectationInput): Expectation[] {
  const list: Expectation[] = [];
  const week = new Set(input.days);
  if (input.schedule && input.schedule.rows.length > 0) {
    for (const day of input.days) {
      for (const brigade of input.brigades) {
        const ids = scheduleObjectIds(input.schedule.rows, brigade, day, [...input.objects]);
        for (const objectId of ids)
          list.push({
            key: `${brigade.id}|${day}|${objectId}`,
            brigadeId: brigade.id,
            day,
            objectId,
            source: "schedule",
          });
      }
    }
    return list;
  }
  for (const a of input.assignments) {
    if (!week.has(a.day)) continue;
    for (const objectId of a.objectIds)
      list.push({
        key: `${a.brigadeId}|${a.day}|${objectId}`,
        brigadeId: a.brigadeId,
        day: a.day,
        objectId,
        source: "assignment",
      });
  }
  return list;
}

/** Получено отчётов: ожидание закрыто, если есть неотклонённая запись бригады за день по объекту */
export function coverage(
  expected: readonly Expectation[],
  entries: readonly TimeEntry[],
): { received: number; expected: number; missing: Expectation[] } {
  const have = new Set(
    entries
      .filter((e) => e.status !== "rejected")
      .map((e) => `${e.brigadeId}|${e.day}|${e.objectId}`),
  );
  const missing = expected.filter((x) => !have.has(x.key));
  return { received: expected.length - missing.length, expected: expected.length, missing };
}

/* ---------------------------------------------------------------- Причины до закрытия */

export type CloseReasonKind =
  "missing" | "overlap" | "no-estimate" | "pending" | "clarify" | "final-check" | "over-crew";

/** Причина, которая мешает закрыть неделю. `acceptable` — можно «принять как есть» с причиной */
export interface CloseReason {
  key: string;
  kind: CloseReasonKind;
  text: string;
  entryIds: string[];
  acceptable: boolean;
}

export interface CloseInput {
  days: readonly string[];
  entries: readonly TimeEntry[];
  estimates: readonly Estimate[];
  objects: readonly Pick<WorkObject, "id" | "label">[];
  brigades: readonly Pick<Brigade, "id" | "name">[];
  crew: readonly CrewMember[];
  finalChecks: readonly FinalCheck[];
  missing: readonly Expectation[];
}

function dayName(day: string): string {
  const names = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];
  return names[new Date(`${day}T00:00:00`).getDay()] ?? day;
}

/**
 * Что мешает закрыть неделю. Непроверенное и «на уточнении» принять как есть нельзя:
 * неподтверждённое не попадает в итог (инвариант 1). Остальное руководитель может принять
 * с причиной — она уходит в версию периода
 */
export function closeReasons(input: CloseInput): CloseReason[] {
  const week = new Set(input.days);
  const own = input.entries.filter((e) => week.has(e.day));
  const name = (id: string) => input.brigades.find((b) => b.id === id)?.name ?? "Бригада";
  const label = (id: string) => input.objects.find((o) => o.id === id)?.label ?? "объект";
  const reasons: CloseReason[] = [];

  const pending = own.filter((e) => e.status === "pending");
  if (pending.length)
    reasons.push({
      key: "pending",
      kind: "pending",
      text: `Не проверено записей: ${pending.length}`,
      entryIds: pending.map((e) => e.id),
      acceptable: false,
    });
  const clarify = own.filter((e) => e.status === "clarify");
  if (clarify.length)
    reasons.push({
      key: "clarify",
      kind: "clarify",
      text: `На уточнении у бригадиров: ${clarify.length}`,
      entryIds: clarify.map((e) => e.id),
      acceptable: false,
    });
  const unchecked = finalCheckList([...own], [...input.finalChecks], [...input.days]);
  if (unchecked.length)
    reasons.push({
      key: "final-check",
      kind: "final-check",
      text: `Подтверждено системой без итоговой проверки: ${unchecked.length}`,
      entryIds: unchecked.map((e) => e.id),
      acceptable: false,
    });

  for (const x of input.missing)
    reasons.push({
      key: `missing|${x.key}`,
      kind: "missing",
      text: `Нет записи: ${name(x.brigadeId)} за ${dayName(x.day)}, ${label(x.objectId)}`,
      entryIds: [],
      acceptable: true,
    });

  for (const o of findOverlaps([...own]))
    reasons.push({
      key: `overlap|${[o.a.id, o.b.id].sort().join("|")}`,
      kind: "overlap",
      text: `Пересекаются ${o.a.number} и ${o.b.number}: ${name(o.a.brigadeId)}, ${o.minutes} мин`,
      entryIds: [o.a.id, o.b.id],
      acceptable: true,
    });

  const confirmedEstimate = new Set(
    input.estimates.filter((e) => e.status === "confirmed").map((e) => e.objectId),
  );
  const noEstimate = new Map<string, string[]>();
  for (const e of own) {
    if (e.status === "rejected" || e.source === "fact-report" || confirmedEstimate.has(e.objectId))
      continue;
    noEstimate.set(e.objectId, [...(noEstimate.get(e.objectId) ?? []), e.id]);
  }
  for (const [objectId, ids] of noEstimate)
    reasons.push({
      key: `no-estimate|${objectId}`,
      kind: "no-estimate",
      text: `Объект без сметы: ${label(objectId)}`,
      entryIds: ids,
      acceptable: true,
    });

  for (const e of own) {
    if (e.status === "rejected") continue;
    const people = headcountOf(e);
    const crew = crewOn(input.crew, e.brigadeId, e.day).length;
    if (people !== null && crew > 0 && people > crew)
      reasons.push({
        key: `over-crew|${e.id}`,
        kind: "over-crew",
        text: `${e.number}: людей ${people}, а в составе бригады ${crew} (${name(e.brigadeId)})`,
        entryIds: [e.id],
        acceptable: true,
      });
  }
  return reasons;
}

/** Принятое «как есть»: ключ причины и обязательная причина руководителя */
export interface Acceptance {
  key: string;
  reason: string;
}

/** Причины, которые ещё мешают: непринимаемые и не принятые с непустой причиной */
export function blockingReasons(
  reasons: readonly CloseReason[],
  accepted: readonly Acceptance[],
): CloseReason[] {
  const ok = new Set(accepted.filter((a) => a.reason.trim()).map((a) => a.key));
  return reasons.filter((r) => !r.acceptable || !ok.has(r.key));
}

/* ---------------------------------------------------------------- Версии периода */

export interface PeriodVersion {
  id: string;
  weekFrom: string;
  weekTo: string;
  version: number;
  closedAt: string;
  closedBy: string;
  /** Копия подтверждённых записей недели на момент закрытия: файл версии строится из неё */
  entries: TimeEntry[];
  totals: { accruedRub: number; minutes: number; manMinutes: number; count: number };
  accepted: Acceptance[];
  /** Заполнено, когда версию переоткрыли: дальше действует следующая */
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
}

export interface PeriodState {
  /** Действующая закрытая версия; null — неделя открыта */
  closed: PeriodVersion | null;
  versions: PeriodVersion[];
  nextVersion: number;
}

export function periodState(versions: readonly PeriodVersion[], weekFrom: string): PeriodState {
  const own = versions.filter((v) => v.weekFrom === weekFrom).sort((a, b) => a.version - b.version);
  const last = own[own.length - 1] ?? null;
  return {
    closed: last && last.reopenedAt === null ? last : null,
    versions: own,
    nextVersion: (last?.version ?? 0) + 1,
  };
}

/** День лежит в закрытой неделе: менять записи на него нельзя (инвариант 3) */
export function isDayLocked(versions: readonly PeriodVersion[], day: string): boolean {
  return versions.some((v) => v.reopenedAt === null && v.weekFrom <= day && day <= v.weekTo);
}

/** Версия из записей недели: только подтверждённые, копией (инвариант 1) */
export function freezeWeek(
  entries: readonly TimeEntry[],
  days: readonly string[],
): Pick<PeriodVersion, "entries" | "totals"> {
  const week = new Set(days);
  const frozen = entries
    .filter((e) => week.has(e.day) && e.status === "confirmed")
    .map((e) => structuredClone(e));
  return {
    entries: frozen,
    totals: {
      accruedRub: frozen.reduce((a, e) => a + (e.amountRub ?? 0), 0),
      minutes: frozen.reduce((a, e) => a + e.minutes, 0),
      manMinutes: frozen.reduce((a, e) => a + (manMinutesOf(e) ?? 0), 0),
      count: frozen.length,
    },
  };
}
