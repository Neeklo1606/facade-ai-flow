/**
 * Признаки записи и их уровень (ADR-044, F5; ADR-052). Одно правило для экрана проверки
 * и для «Спросить ГАЙКУ»: «требует внимания» считается одинаково везде.
 * Объяснения «Почему помечено» живут у экрана (review/rules.ts), здесь только ключи и уровни.
 */
import { FLAG_LABEL, type EntryFlag } from "./model";
import type { EntryView } from "./view";

/** Уровень признака: блокирует, требует решения, информирует */
export type MarkLevel = "block" | "decide" | "info";

export type MarkKey =
  EntryFlag | "zero-minutes" | "late-entry" | "manual-amount" | "needs-agreement";

export const MARK_LEVEL: Record<MarkKey, MarkLevel> = {
  overlap: "block",
  duplicate: "block",
  "zero-minutes": "block",
  "no-amount": "decide",
  "no-estimate": "decide",
  "high-rate": "decide",
  "late-entry": "decide",
  "manual-amount": "decide",
  "multi-day-object": "info",
  "needs-agreement": "info",
};

export const MARK_LABEL: Record<MarkKey, string> = {
  ...FLAG_LABEL,
  "zero-minutes": "Ноль минут",
  "late-entry": "Вчерашняя запись",
  "manual-amount": "Введено вручную",
  "needs-agreement": "Требует согласования",
};

export const LEVEL_ORDER: Record<MarkLevel, number> = { block: 0, decide: 1, info: 2 };

/** Признаки записи от важного к тихому: флаги домена плюс то, что видно по самой записи */
export function markKeysOf(view: EntryView): MarkKey[] {
  const keys = new Set<MarkKey>(view.flags);
  const { entry } = view;
  if (entry.minutes === 0) keys.add("zero-minutes");
  // Внесено позже дня работы: бригадир вспоминал, а не записывал
  if (entry.createdAt.slice(0, 10) > entry.day) keys.add("late-entry");
  if (view.amountOrigin === "manual") keys.add("manual-amount");
  if (view.estimate?.status === "manual-pending") keys.add("needs-agreement");
  /*
   * Ждёт проверки, а у объекта подтверждённая стоимость: сумма начислится при подтверждении
   * (правило адаптера). Метка «Нет суммы» тут сбивала с толку: через шаг в отчёте сумма есть
   */
  if (
    entry.amountRub === null &&
    entry.status === "pending" &&
    view.estimate?.status === "confirmed"
  )
    keys.delete("no-amount");
  return [...keys].sort((a, b) => LEVEL_ORDER[MARK_LEVEL[a]] - LEVEL_ORDER[MARK_LEVEL[b]]);
}

/** Запись требует внимания, если есть признак не только информационный */
export function requiresAttention(view: EntryView): boolean {
  return markKeysOf(view).some((key) => MARK_LEVEL[key] !== "info");
}
