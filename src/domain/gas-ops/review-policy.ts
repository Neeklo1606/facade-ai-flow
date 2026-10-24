/**
 * Режимы проверки записей (ADR-053, раздел 5). Заказчик 21.10: сначала менеджер проверяет
 * всё, потом автоподтверждение при высокой точности, но сдача отчёта — финансовая операция,
 * и перед ней итоговая проверка человеком обязательна во всех режимах.
 */
import type { EntryFlag, Review, TimeEntry } from "./model";

export type ReviewMode = "all" | "flagged" | "none";

export const REVIEW_MODE_LABEL: Record<ReviewMode, string> = {
  all: "Проверять все",
  flagged: "Проверять только с замечаниями",
  none: "Без проверки, итоговая проверка перед отчётом",
};

export const REVIEW_MODE_HINT: Record<ReviewMode, string> = {
  all: "Каждая запись бригадира ждёт решения менеджера.",
  flagged:
    "Записи без признаков подтверждаются сами и попадают в итоговую проверку. С признаками ждут менеджера.",
  none: "Записи подтверждаются сами. Перед выгрузкой и сдачей отчёта человек проверяет их одним списком.",
};

export interface ReviewSettings {
  mode: ReviewMode;
  /** Порог точности для режима без проверки, проценты */
  thresholdPercent: number;
  changedBy: string | null;
  changedAt: string | null;
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  mode: "all",
  thresholdPercent: 95,
  changedBy: null,
  changedAt: null,
};

/** Сколько последних решений считается и сколько нужно минимум, чтобы точность что-то значила */
export const ACCURACY_WINDOW = 50;
export const ACCURACY_MIN_SAMPLE = 20;

export interface Accuracy {
  /** Записи, по которым человек принял решение, в окне */
  decided: number;
  /** Из них подтверждены без правки, отклонения и уточнения */
  clean: number;
  /** Проценты, целое; null — решений меньше минимума */
  percent: number | null;
}

/**
 * Точность: доля последних решённых человеком записей, подтверждённых без правки.
 * Правка, отклонение или уточнение по записи делают её «не чистой».
 */
export function accuracyOf(reviews: Review[]): Accuracy {
  const byEntry = new Map<string, Review[]>();
  for (const r of [...reviews].sort((a, b) => a.at.localeCompare(b.at))) {
    if (r.actor === AUTO_ACTOR) continue;
    byEntry.set(r.entryId, [...(byEntry.get(r.entryId) ?? []), r]);
  }
  const decided = [...byEntry.values()]
    .filter((list) => list.some((r) => r.action !== "correct"))
    .sort((a, b) => a.at(-1)!.at.localeCompare(b.at(-1)!.at))
    .slice(-ACCURACY_WINDOW);
  const clean = decided.filter((list) => list.every((r) => r.action === "confirm")).length;
  return {
    decided: decided.length,
    clean,
    percent:
      decided.length < ACCURACY_MIN_SAMPLE ? null : Math.floor((clean / decided.length) * 100),
  };
}

export type ModeAvailability = { ok: true } | { ok: false; reason: string };

/** Доступен ли режим: режим 3 только при набранном пороге точности */
export function modeAvailability(
  mode: ReviewMode,
  accuracy: Accuracy,
  thresholdPercent: number,
): ModeAvailability {
  if (mode !== "none") return { ok: true };
  if (accuracy.percent === null)
    return {
      ok: false,
      reason: `Нужно не меньше ${ACCURACY_MIN_SAMPLE} решений менеджера, сейчас ${accuracy.decided}.`,
    };
  if (accuracy.percent < thresholdPercent)
    return {
      ok: false,
      reason: `Точность ${accuracy.percent}% ниже порога ${thresholdPercent}%: ${accuracy.clean} из ${accuracy.decided} записей приняты без правки.`,
    };
  return { ok: true };
}

/** Кто подтверждает автоматически: пишется в запись и журнал, чтобы её нашла итоговая проверка */
export const AUTO_ACTOR = "auto";

/** Куда идёт отправленная запись в этом режиме */
export function routeEntry(mode: ReviewMode, flags: EntryFlag[]): "queue" | "auto" {
  if (mode === "all") return "queue";
  if (mode === "flagged") return flags.length === 0 ? "auto" : "queue";
  return "auto";
}

export interface FinalCheck {
  id: string;
  week: string;
  at: string;
  by: string;
  entryIds: string[];
}

/** Записи недели без ручного подтверждения, которые ещё не прошли итоговую проверку */
export function finalCheckList(
  entries: TimeEntry[],
  checks: FinalCheck[],
  days: string[],
): TimeEntry[] {
  const checked = new Set(checks.flatMap((c) => c.entryIds));
  const week = new Set(days);
  return entries.filter(
    (e) =>
      week.has(e.day) &&
      e.status === "confirmed" &&
      e.reviewedBy === AUTO_ACTOR &&
      !checked.has(e.id),
  );
}
