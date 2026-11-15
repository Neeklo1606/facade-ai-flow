/**
 * Автопилот проверки (ADR-070, бриф GAIKA_GAS_AUTOPILOT, раздел 3). Чистые функции:
 * запись → замечания → решение «принять сама / в очередь» с причиной, правилом и версией правил.
 *
 * Деньги автопилот не решает никогда: закрыть неделю, подтвердить смету, изменить сумму,
 * переоткрыть неделю может только человек. Автопилот только принимает чистую запись времени,
 * у объекта которой уже есть подтверждённая человеком смета. Не уверен — в очередь с причиной.
 *
 * Решение считается при каждой отправке в любом режиме. В режиме «Проверять всё» это «тень»:
 * запись всё равно ждёт менеджера, а решение менеджера потом сверяется с тенью. Так копится
 * счётчик «совпадение авто-решений с решениями менеджера», по которому включают автопилот.
 */
import { REMARK_LABEL, remarksOf, type EntryInfo, type RemarkKey } from "./entry-info";
import type { Review, TimeEntry } from "./model";
import { AUTO_ACTOR, type ReviewMode } from "./review-policy";

/** Версия набора правил: меняется при любом изменении условий ниже, пишется в каждое решение */
export const AUTOPILOT_RULES_VERSION = "1";
/** Единственное правило авто-принятия этой версии */
export const AUTOPILOT_RULE = "clean-entry";
export const AUTOPILOT_RULE_LABEL = "нет замечаний";

export interface AutopilotConfig {
  /** Длительность записи, выше которой запись уходит менеджеру, минуты */
  maxMinutes: number;
  /** Доля авто-принятых записей, которые попадают в выборочную проверку, проценты */
  samplePercent: number;
}

export const DEFAULT_AUTOPILOT: AutopilotConfig = { maxMinutes: 12 * 60, samplePercent: 10 };

/** Порог совпадения, который обсуждали с заказчиком, проценты */
export const AUTOPILOT_TARGET_PERCENT = 99.9;
/** Окно счётчика совпадения, дни */
export const AGREEMENT_WINDOW_DAYS = 14;
/** Меньше решений в окне — процент не показывается как значимый */
export const AGREEMENT_MIN_SAMPLE = 20;

/** Причина, по которой запись не принята сама */
export type AutoReasonKey =
  | Exclude<RemarkKey, "multi-day-object">
  | "no-confirmed-cost"
  | "too-long"
  | "off-schedule"
  | "no-schedule"
  | "not-submitted";

export const AUTO_REASON_LABEL: Record<AutoReasonKey, string> = {
  ...(Object.fromEntries(
    Object.entries(REMARK_LABEL).filter(([key]) => key !== "multi-day-object"),
  ) as Record<Exclude<RemarkKey, "multi-day-object">, string>),
  "no-confirmed-cost": "Нет подтверждённой сметы",
  "too-long": "Длительность выше порога",
  "off-schedule": "Объект не по графику",
  "no-schedule": "Нет графика на день",
  "not-submitted": "Запись не отправлена",
};

export interface AutoDecision {
  /** auto — принята системой; queue — ждёт менеджера */
  route: "auto" | "queue";
  /** Режим на момент решения: в «Проверять всё» решение только тень */
  mode: ReviewMode;
  rule: string;
  version: string;
  reasons: { key: AutoReasonKey; label: string }[];
  /** Авто-принятая запись попала в выборочную проверку перед закрытием недели */
  sampled: boolean;
  at: string;
}

export interface DecideInput {
  mode: ReviewMode;
  entry: Pick<TimeEntry, "id" | "status" | "minutes" | "objectId">;
  /** Сведения о записи из `entryInfo`: те же замечания, что видит менеджер */
  info: EntryInfo;
  /** Смета объекта подтверждена человеком */
  hasConfirmedEstimate: boolean;
  /** Объекты бригады на этот день по графику; null — графика на день нет */
  expectedObjectIds: readonly string[] | null;
  config?: AutopilotConfig;
  at: string;
}

/** Замечания, которые принятию не мешают: только сведения */
const NOTE_REMARKS = new Set<RemarkKey>(["multi-day-object"]);

/** Все причины не принимать запись сам: пустой список — запись чистая */
export function autoReasons(input: DecideInput): AutoDecision["reasons"] {
  const config = input.config ?? DEFAULT_AUTOPILOT;
  const keys: AutoReasonKey[] = [];
  if (input.entry.status !== "pending") keys.push("not-submitted");
  for (const r of remarksOf(input.info))
    if (!NOTE_REMARKS.has(r.key)) keys.push(r.key as AutoReasonKey);
  if (!input.hasConfirmedEstimate && !keys.includes("no-cost")) keys.push("no-confirmed-cost");
  if (input.entry.minutes > config.maxMinutes) keys.push("too-long");
  if (input.expectedObjectIds === null) keys.push("no-schedule");
  else if (!input.expectedObjectIds.includes(input.entry.objectId)) keys.push("off-schedule");
  return [...new Set(keys)].map((key) => ({ key, label: AUTO_REASON_LABEL[key] }));
}

/**
 * Стабильная выборка: одна и та же запись всегда в выборке или всегда вне её, повторный
 * расчёт не «перебрасывает монетку». FNV-1a от идентификатора, корзина 0–99
 */
export function sampleBucket(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

export function decideEntry(input: DecideInput): AutoDecision {
  const config = input.config ?? DEFAULT_AUTOPILOT;
  const reasons = autoReasons(input);
  const route = input.mode !== "all" && reasons.length === 0 ? "auto" : "queue";
  return {
    route,
    mode: input.mode,
    rule: AUTOPILOT_RULE,
    version: AUTOPILOT_RULES_VERSION,
    reasons,
    // «Только с замечаниями» проверяет все авто-принятые итоговой проверкой; автопилот – выборку
    sampled:
      route === "auto" &&
      (input.mode !== "none" || sampleBucket(input.entry.id) < config.samplePercent),
    at: input.at,
  };
}

/** Строка истории: «Принято автоматически: нет замечаний (правило clean-entry, версия 1)» */
export function decisionLine(decision: AutoDecision): string {
  const rule = `правило ${decision.rule}, версия ${decision.version}`;
  if (decision.route === "auto") return `Принято автоматически: ${AUTOPILOT_RULE_LABEL} (${rule})`;
  const why = decision.reasons.map((r) => r.label.toLowerCase()).join(", ");
  return decision.mode === "all"
    ? `Автопилот принял бы сам: ${why ? "нет" : "да"}${why ? `, причина: ${why}` : ""} (${rule})`
    : `В очередь: ${why} (${rule})`;
}

/* ---------------------------------------------------------------- Счётчик совпадения */

export interface Agreement {
  /** Записи с решением автопилота и решением человека в окне */
  total: number;
  matched: number;
  /** Автопилот принял бы, а менеджер поправил, отклонил или вернул: опасное расхождение */
  risky: number;
  /** Автопилот отправил бы в очередь, а менеджер принял без правки: осторожное расхождение */
  cautious: number;
  /** Из них решений, пересчитанных по текущим правилам (запись решена до автопилота) */
  recomputed: number;
  /** Проценты с одним знаком; null — решений меньше минимума */
  percent: number | null;
  from: string;
  to: string;
}

/**
 * Совпадение авто-решений с решениями менеджера за последние 14 дней. Решение менеджера
 * «чистое» — только подтверждения без правки; правка, отклонение, уточнение и возврат
 * авто-принятой записи в очередь – «не чистое». Совпадение: автопилот «принять» и менеджер
 * чисто, или автопилот «в очередь» и менеджер не чисто
 */
export function autopilotAgreement(input: {
  /** `retro` – решение пересчитано по текущим правилам, а не сохранено при отправке */
  entries: readonly (Pick<TimeEntry, "id" | "autoDecision"> & { retro?: boolean })[];
  reviews: readonly Review[];
  /** Момент расчёта «ГГГГ-ММ-ДДTЧЧ:ММ» */
  now: string;
  days?: number;
}): Agreement {
  const days = input.days ?? AGREEMENT_WINDOW_DAYS;
  const end = Date.parse(`${input.now.slice(0, 10)}T23:59:59Z`);
  const fromDate = new Date(end - days * 86_400_000 + 1000).toISOString().slice(0, 10);
  const human = new Map<string, Review[]>();
  for (const r of input.reviews) {
    if (
      r.actor === AUTO_ACTOR ||
      r.at.slice(0, 10) < fromDate ||
      r.at.slice(0, 10) > input.now.slice(0, 10)
    )
      continue;
    human.set(r.entryId, [...(human.get(r.entryId) ?? []), r]);
  }
  let total = 0;
  let matched = 0;
  let risky = 0;
  let cautious = 0;
  let recomputed = 0;
  for (const entry of input.entries) {
    const decision = entry.autoDecision;
    const list = human.get(entry.id);
    if (!decision || !list?.length) continue;
    // Ответ бригадира – не решение менеджера
    const decisions = list.filter((r) => r.action !== "answer");
    if (!decisions.length) continue;
    const clean = decisions.every((r) => r.action === "confirm");
    total += 1;
    if (entry.retro) recomputed += 1;
    const auto = decision.reasons.length === 0;
    if (auto === clean) matched += 1;
    else if (auto) risky += 1;
    else cautious += 1;
  }
  return {
    total,
    matched,
    risky,
    cautious,
    recomputed,
    percent: total < AGREEMENT_MIN_SAMPLE ? null : Math.floor((matched / total) * 1000) / 10,
    from: fromDate,
    to: input.now.slice(0, 10),
  };
}

export type AutopilotAvailability =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      /** Менеджер может включить, подтвердив, что видел число */ overridable: true;
    };

/** Можно ли включить автопилот без оговорки: совпадение не ниже порога на достаточной выборке */
export function autopilotAvailability(
  agreement: Agreement,
  target = AUTOPILOT_TARGET_PERCENT,
): AutopilotAvailability {
  if (agreement.percent === null)
    return {
      ok: false,
      overridable: true,
      reason: `Совпадение считается по решениям менеджера за ${AGREEMENT_WINDOW_DAYS} дней: пока ${agreement.total}, нужно не меньше ${AGREEMENT_MIN_SAMPLE}.`,
    };
  if (agreement.percent < target)
    return {
      ok: false,
      overridable: true,
      reason: `Совпадение ${fmtPercent(agreement.percent)} ниже порога ${fmtPercent(target)}: ${agreement.matched} из ${agreement.total}, опасных расхождений ${agreement.risky}.`,
    };
  return { ok: true };
}

export function fmtPercent(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}
