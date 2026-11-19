/**
 * Режимы проверки записей (ADR-053, раздел 5). Заказчик 21.10: сначала менеджер проверяет
 * всё, потом автоподтверждение при высокой точности, но сдача отчёта — финансовая операция,
 * и перед ней итоговая проверка человеком обязательна во всех режимах.
 */
import type { EntryFlag, Review, TimeEntry } from "./model";

export type ReviewMode = "all" | "flagged" | "none";

/**
 * «none» – исторический идентификатор режима: в базе он уже хранится. С ADR-070 это
 * «Автопилот»: запись принимается сама только по правилу без замечаний, а не любая
 */
export const REVIEW_MODE_LABEL: Record<ReviewMode, string> = {
  all: "Проверять всё",
  flagged: "Только с замечаниями",
  none: "Автопилот",
};

export const REVIEW_MODE_HINT: Record<ReviewMode, string> = {
  all: "Каждая запись бригадира ждёт решения менеджера.",
  flagged:
    "Записи без замечаний и с подтверждённой сметой принимаются сами, перед закрытием недели менеджер проверяет их все. С замечаниями ждут менеджера.",
  none: "Записи без замечаний и с подтверждённой сметой принимаются сами. Перед закрытием недели менеджер смотрит выборку. Спорные ждут менеджера с причиной.",
};

export interface ReviewSettings {
  mode: ReviewMode;
  /** Начисление (ADR-078): нет — по доле раздела, «time» — по минутам всей сметы, как до B */
  accrualMode?: import("./section-accrual").AccrualMode;
  /** Порог точности для режима без проверки, проценты */
  thresholdPercent: number;
  changedBy: string | null;
  changedAt: string | null;
  /**
   * Правило стоимости подтверждает не тот, кто его сохранил (ADR-062, решение владельца 1).
   * По умолчанию выключено: менеджер подтверждает своё правило, история это называет
   */
  secondRuleApprover?: boolean;
  /** Доля авто-принятых записей в выборочной проверке при автопилоте, проценты (ADR-070) */
  samplePercent?: number;
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

/**
 * Предложение перейти на «Проверять только с замечаниями» (финальный промт, 1.2): первые
 * две недели менеджер проверяет всё, затем система сама предлагает режим, если точность
 * за полное окно последних решений не ниже порога. Включает человек, предложение только плашка.
 */
export const SUGGEST_AFTER_DAYS = 14;
export const SUGGEST_PERCENT = 95;

export interface ModeSuggestion {
  percent: number;
  decided: number;
}

export function flaggedModeSuggestion(input: {
  settings: ReviewSettings;
  accuracy: Accuracy;
  reviews: readonly Review[];
  now: string;
}): ModeSuggestion | null {
  const { settings, accuracy } = input;
  if (settings.mode !== "all") return null;
  if (accuracy.percent === null || accuracy.decided < ACCURACY_WINDOW) return null;
  if (accuracy.percent < SUGGEST_PERCENT) return null;
  // Отсчёт двух недель — от первого решения человека: с него началась проверка
  const first = input.reviews
    .filter((r) => r.actor !== AUTO_ACTOR)
    .reduce<string | null>((min, r) => (min === null || r.at < min ? r.at : min), null);
  if (!first) return null;
  const days = (Date.parse(input.now) - Date.parse(first)) / 86_400_000;
  if (!(days >= SUGGEST_AFTER_DAYS)) return null;
  return { percent: accuracy.percent, decided: accuracy.decided };
}

/** Запись принята системой без менеджера: её видно в журнале и её можно вернуть в очередь */
export function isAutoAccepted(entry: Pick<TimeEntry, "status" | "reviewedBy">): boolean {
  return entry.status === "confirmed" && entry.reviewedBy === AUTO_ACTOR;
}

export const AUTO_ACCEPTED_LABEL = "принята автоматически";

/** Кто подтверждает автоматически: пишется в запись и журнал, чтобы её нашла итоговая проверка */
export const AUTO_ACTOR = "auto";

/**
 * Признаки только для сведения: «Объект на несколько дней» говорит о распределении стоимости,
 * а не о замечании, и в разборе подписан «Принятию не мешает». Автоприём он не держит.
 * Нет суммы или сметы — держит: финансовый итог подтверждает человек.
 */
const NOTE_FLAGS = new Set<EntryFlag>(["multi-day-object"]);

/** Признаки, из-за которых запись ждёт менеджера в режиме «только с замечаниями» */
export function remarkFlags(flags: readonly EntryFlag[]): EntryFlag[] {
  return flags.filter((f) => !NOTE_FLAGS.has(f));
}

/**
 * Куда идёт отправленная запись в этом режиме, только по признакам. Полное решение с графиком,
 * сметой и длительностью – `decideEntry` (ADR-070); с ADR-070 автопилот («none») не принимает
 * запись с замечаниями, как и «только с замечаниями»
 */
export function routeEntry(mode: ReviewMode, flags: EntryFlag[]): "queue" | "auto" {
  if (mode === "all") return "queue";
  return remarkFlags(flags).length === 0 ? "auto" : "queue";
}

export interface FinalCheck {
  id: string;
  week: string;
  at: string;
  by: string;
  entryIds: string[];
}

/**
 * Записи недели без ручного подтверждения, которые ещё не прошли итоговую проверку.
 * При автопилоте (ADR-070) – только выборка: решение автопилота помечает запись `sampled`.
 * Запись без решения автопилота (принята до ADR-070) проверяется вся, как раньше
 */
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
      e.autoDecision?.sampled !== false &&
      !checked.has(e.id),
  );
}
