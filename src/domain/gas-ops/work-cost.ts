/**
 * Стоимость работ объекта из сметы (ADR-053, разделы 2 и 3).
 *
 * - Правило состава: строки итогов со знаком. По умолчанию «без НДС минус материалы»
 *   со статусом «Требует согласования»: это кандидат владельца, а не решение заказчика.
 * - Версии: стоимость берётся из последней подтверждённой версии сметы объекта.
 * - Распределение по записям: по минутам (ADR-043), наибольшим остатком до целого рубля,
 *   сумма частей равна стоимости ровно.
 * - Пересчёт: меняются только неподтверждённые записи. Подтверждённые и выданные отчёты
 *   молча не меняются: отчёт помечается «Требует обновления».
 */
import type { TimeEntry } from "./model";
import {
  TOTAL_LABEL,
  type EstimateFormat,
  type EstimateIssue,
  type EstimateSection,
  type ParseStatus,
  type Sourced,
  type TotalKey,
} from "./estimate-labels";

export interface CostRuleTerm {
  key: TotalKey;
  sign: 1 | -1;
}

export const DEFAULT_RULE_TERMS: CostRuleTerm[] = [
  { key: "withoutVat", sign: 1 },
  { key: "materials", sign: -1 },
];

export interface CostRule {
  id: string;
  /** null — правило компании, иначе переопределение для объекта */
  objectId: string | null;
  terms: CostRuleTerm[];
  status: "needs-agreement" | "confirmed";
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export const RULE_STATUS_LABEL: Record<CostRule["status"], string> = {
  "needs-agreement": "Требует согласования",
  confirmed: "Согласовано",
};

export const DEFAULT_COMPANY_RULE: CostRule = {
  id: "rule-company",
  objectId: null,
  terms: DEFAULT_RULE_TERMS,
  status: "needs-agreement",
  confirmedBy: null,
  confirmedAt: null,
};

/** Формула словами: «Всего без НДС минус материалы» */
export function ruleFormula(terms: CostRuleTerm[]): string {
  return terms
    .map((term, i) => {
      const label = TOTAL_LABEL[term.key];
      if (i === 0) return term.sign === 1 ? label : `минус ${label.toLowerCase()}`;
      return `${term.sign === 1 ? "плюс" : "минус"} ${label.toLowerCase()}`;
    })
    .join(" ");
}

export type RuleResult = { ok: true; kopecks: number } | { ok: false; missing: TotalKey[] };

/** Применить правило к итогам сметы. Нет нужной строки — нет числа, а не ноль */
export function applyRule(
  totals: Partial<Record<TotalKey, Sourced>>,
  terms: CostRuleTerm[],
): RuleResult {
  const missing = terms.filter((t) => !totals[t.key]).map((t) => t.key);
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, kopecks: terms.reduce((a, t) => a + t.sign * totals[t.key]!.kopecks, 0) };
}

/** Правило объекта: переопределение, если есть, иначе правило компании */
export function ruleFor(objectId: string, rules: CostRule[]): CostRule {
  return (
    rules.find((r) => r.objectId === objectId) ??
    rules.find((r) => r.objectId === null) ??
    DEFAULT_COMPANY_RULE
  );
}

/** Версия сметы: одна загрузка файла. Адресов в версии нет, только имя файла */
export interface EstimateVersion {
  id: string;
  /** Объект, к которому человек привязал смету; null — ещё не привязана */
  objectId: string | null;
  version: number;
  fileName: string;
  sheet: string | null;
  uploadedAt: string;
  uploadedBy: string;
  format: EstimateFormat | null;
  parseStatus: ParseStatus;
  totals: Partial<Record<TotalKey, Sourced>>;
  vatRate: number | null;
  laborHours: { value: number; row: number } | null;
  sections: EstimateSection[];
  issues: EstimateIssue[];
  /** Сметчик отметил замечания разбора как проверенные */
  issuesReviewedBy: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

/** Можно ли подтвердить версию: привязана к объекту и без непроверенных замечаний */
export function canConfirmVersion(
  v: EstimateVersion,
): { ok: true } | { ok: false; reason: string } {
  if (!v.objectId) return { ok: false, reason: "Сначала привяжите смету к объекту." };
  if (v.parseStatus === "unknown-format")
    return { ok: false, reason: "Формат не распознан: введите сумму вручную." };
  if (v.parseStatus === "needs-review" && !v.issuesReviewedBy)
    return {
      ok: false,
      reason: "Смета требует проверки сметчиком: отметьте замечания проверенными.",
    };
  return { ok: true };
}

/** Последняя подтверждённая версия сметы объекта */
export function latestConfirmed(
  objectId: string,
  versions: EstimateVersion[],
): EstimateVersion | null {
  return (
    versions
      .filter((v) => v.objectId === objectId && v.confirmedAt !== null)
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/** Следующий номер версии для объекта */
export function nextVersion(objectId: string | null, versions: EstimateVersion[]): number {
  if (!objectId) return 1;
  return (
    versions.filter((v) => v.objectId === objectId).reduce((a, v) => Math.max(a, v.version), 0) + 1
  );
}

/** Стоимость работ по версии и правилу, целые рубли (округление в конце) */
export function workCostRub(version: EstimateVersion, rule: CostRule): number | null {
  const result = applyRule(version.totals, rule.terms);
  if (!result.ok) return null;
  return Math.round(result.kopecks / 100);
}

/**
 * Распределить целые рубли по минутам методом наибольшего остатка. Сумма частей равна
 * `totalRub` ровно; при равных остатках раньше идёт запись, стоящая раньше в списке.
 */
export function allocateByMinutes(
  totalRub: number,
  items: { id: string; minutes: number }[],
): Map<string, number> {
  const result = new Map<string, number>();
  const minutes = items.reduce((a, i) => a + Math.max(0, i.minutes), 0);
  if (items.length === 0) return result;
  if (minutes === 0) {
    items.forEach((i, idx) => result.set(i.id, idx === 0 ? totalRub : 0));
    return result;
  }
  const raw = items.map((i, idx) => {
    const exact = (totalRub * Math.max(0, i.minutes)) / minutes;
    return { id: i.id, idx, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = totalRub - raw.reduce((a, r) => a + r.floor, 0);
  const order = [...raw].sort((a, b) => b.rest - a.rest || a.idx - b.idx);
  for (const r of order) {
    if (left <= 0) break;
    r.floor += 1;
    left -= 1;
  }
  for (const r of raw) result.set(r.id, r.floor);
  return result;
}

export interface Recalc {
  entries: TimeEntry[];
  /** Записи, у которых поменялась сумма: было, стало */
  changed: { id: string; from: number | null; to: number }[];
  /** Подтверждённые записи, чья доля по новой версии не совпала с их суммой */
  confirmedMismatch: string[];
}

/**
 * Пересчитать суммы записей объекта по новой стоимости. Доли считаются по всем
 * неотклонённым записям объекта, но присваиваются только неподтверждённым, у которых сумма
 * уже есть: запись без суммы получит долю при подтверждении. Подтверждённые не меняются,
 * расхождение с ними возвращается отдельно, чтобы пометить отчёт.
 */
export function recalcObject(entries: TimeEntry[], objectId: string, costRub: number): Recalc {
  const own = entries.filter((e) => e.objectId === objectId && e.status !== "rejected");
  const shares = allocateByMinutes(
    costRub,
    own.map((e) => ({ id: e.id, minutes: e.minutes })),
  );
  const changed: Recalc["changed"] = [];
  const confirmedMismatch: string[] = [];
  const next = entries.map((e) => {
    const share = shares.get(e.id);
    if (share === undefined) return e;
    if (e.status === "confirmed") {
      if (e.amountRub !== share) confirmedMismatch.push(e.id);
      return e;
    }
    // Запись без суммы получает долю при подтверждении (ADR-043): здесь её не трогаем,
    // иначе сумма появилась бы до решения менеджера
    if (e.amountRub === null || e.amountRub === share) return e;
    changed.push({ id: e.id, from: e.amountRub, to: share });
    return { ...e, amountRub: share };
  });
  return { entries: next, changed, confirmedMismatch };
}

/** Норма сметы против факта бригад: чел.-ч сметы и минуты по объекту */
export interface NormVsFact {
  normHours: number | null;
  factMinutes: number;
  /** Факт в процентах нормы; null — нормы нет */
  percent: number | null;
}

export function normVsFact(
  laborHours: number | null,
  entries: TimeEntry[],
  objectId: string,
): NormVsFact {
  const factMinutes = entries
    .filter((e) => e.objectId === objectId && e.status !== "rejected")
    .reduce((a, e) => a + e.minutes, 0);
  const percent =
    laborHours && laborHours > 0 ? Math.round((factMinutes / 60 / laborHours) * 100) : null;
  return { normHours: laborHours, factMinutes, percent };
}

/** «норма 57,6 чел.-ч, факт 41,5 ч» */
export function fmtNormVsFact(n: NormVsFact): string {
  const fact = (n.factMinutes / 60).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  if (n.normHours === null) return `нормы нет, факт ${fact} ч`;
  const norm = n.normHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return `норма ${norm} чел.-ч, факт ${fact} ч`;
}

/**
 * Подсказка привязки: объект справочника, чьи слова подписи и кода чаще всего встречаются
 * в имени файла. Подтверждает человек; ничего не найдено — null, ручной выбор всегда есть.
 */
export function suggestObject(
  fileName: string,
  objects: { id: string; label: string; code: string }[],
): string | null {
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/ё/g, "е")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 || /^\d+$/.test(w));
  const fileWords = new Set(words(fileName.replace(/\.(xlsx?|xls)$/i, "")));
  let best: { id: string; score: number } | null = null;
  for (const o of objects) {
    const score = [...new Set([...words(o.label), ...words(o.code)])].filter((w) =>
      fileWords.has(w),
    ).length;
    if (score > 0 && (!best || score > best.score)) best = { id: o.id, score };
  }
  return best?.id ?? null;
}
