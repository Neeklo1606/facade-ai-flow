/**
 * Решение автопилота над данными направления (ADR-070): собирает вход `decideEntry` из снимка
 * так же, как его видит менеджер: замечания `entryInfo`, график или назначения дня, смета.
 * Один код для порта (при отправке) и для пересчёта истории в счётчике совпадения.
 */
import { decideEntry, DEFAULT_AUTOPILOT, type AutoDecision } from "./autopilot";
import { entryInfo } from "./entry-info";
import type { TimeEntry } from "./model";
import type { ReviewMode } from "./review-policy";
import { entryView, type GasData } from "./view";
import { expectations } from "./week";
import { allocateByMinutes } from "./work-cost";
import { splitBySections } from "./section-accrual";

/**
 * Доля стоимости объекта для записи (ADR-053, 3): подтверждённая стоимость распределяется
 * по минутам всех неотклонённых записей объекта. Нет подтверждённой стоимости – null.
 * Стоимость объекта делится по разделам (ADR-085) – тоже null: начисляет доля раздела.
 */
export function shareOf(
  data: Pick<GasData, "estimates" | "entries" | "objectSections" | "reviewSettings">,
  draft: TimeEntry,
): number | null {
  if (splitBySections(data, draft.objectId)) return null;
  const estimate = data.estimates.find(
    (e) => e.objectId === draft.objectId && e.status === "confirmed",
  );
  if (!estimate) return null;
  const own = [
    ...data.entries.filter(
      (e) => e.objectId === draft.objectId && e.status !== "rejected" && e.id !== draft.id,
    ),
    draft,
  ];
  return (
    allocateByMinutes(
      estimate.amountRub,
      own.map((e) => ({ id: e.id, minutes: e.minutes })),
    ).get(draft.id) ?? null
  );
}

export interface DataDecision {
  decision: AutoDecision;
  /** Запись с долей стоимости: её сумма при авто-принятии */
  candidate: TimeEntry;
}

export function decisionInData(input: {
  data: GasData;
  entry: TimeEntry;
  mode: ReviewMode;
  samplePercent?: number | undefined;
  at: string;
}): DataDecision {
  const { data, entry } = input;
  // Замечания считаются с долей стоимости объекта: без неё любая новая запись была бы «без суммы»
  const candidate = { ...entry, amountRub: entry.amountRub ?? shareOf(data, entry) };
  const own = { ...data, entries: [...data.entries.filter((e) => e.id !== entry.id), candidate] };
  const expected = expectations({
    days: data.week.days.includes(entry.day) ? data.week.days : [entry.day],
    brigades: data.brigades,
    objects: data.objects,
    schedule: data.schedule,
    assignments: data.assignments,
  }).filter((x) => x.brigadeId === entry.brigadeId && x.day === entry.day);
  const decision = decideEntry({
    mode: input.mode,
    entry: candidate,
    info: entryInfo(entryView(own, candidate)),
    hasConfirmedEstimate: data.estimates.some(
      (e) => e.objectId === entry.objectId && e.status === "confirmed",
    ),
    expectedObjectIds: expected.length ? expected.map((x) => x.objectId) : null,
    config: {
      ...DEFAULT_AUTOPILOT,
      samplePercent: input.samplePercent ?? DEFAULT_AUTOPILOT.samplePercent,
    },
    at: input.at,
  });
  return { decision, candidate };
}

/**
 * Пересчёт истории для счётчика: что сказали бы текущие правила о записи, решённой менеджером
 * до появления автопилота. Запись считается «как отправленная», состояние объекта – нынешнее,
 * поэтому экран называет такие решения пересчитанными, а не сохранёнными
 */
export function retroDecision(data: GasData, entry: TimeEntry): AutoDecision | null {
  if (entry.autoDecision) return entry.autoDecision;
  if (entry.source === "fact-report" || entry.status === "draft") return null;
  return decisionInData({
    data,
    entry: { ...entry, status: "pending", amountRub: null },
    mode: "all",
    at: entry.createdAt,
  }).decision;
}
