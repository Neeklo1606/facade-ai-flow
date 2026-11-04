/**
 * Стоимость работ объекта из сметы (ADR-053, разделы 2 и 3).
 *
 * - Правило состава: строки итогов со знаком. По умолчанию «без НДС минус материалы»
 *   со статусом «Требует согласования»: это кандидат владельца, а не решение заказчика.
 *   Состав выбирает заказчик в конструкторе (ADR-062, F2): каждая правка — новая редакция
 *   «Требует согласования», подтверждает менеджер. Слагаемым может быть и строка ниже
 *   «ВСЕГО по смете» по подписи (F4): «Технадзор», «Врезка».
 * - Версии: стоимость берётся из последней подтверждённой версии сметы объекта.
 * - Распределение по записям: по минутам (ADR-043), наибольшим остатком до целого рубля,
 *   сумма частей равна стоимости ровно.
 * - Пересчёт: меняются только неподтверждённые записи. Подтверждённые и выданные отчёты
 *   молча не меняются: отчёт помечается «Требует обновления».
 */
import type { TimeEntry } from "./model";
import {
  TOTAL_LABEL,
  TOTAL_ORDER,
  type EstimateExtra,
  type EstimateFormat,
  type EstimateIssue,
  type EstimateSection,
  type ParseStatus,
  type Sourced,
  type TotalKey,
} from "./estimate-labels";

/** Слагаемое из строки ниже «ВСЕГО по смете»: `extra:Технадзор` */
export type ExtraKey = `extra:${string}`;
export type TermKey = TotalKey | ExtraKey;

export interface CostRuleTerm {
  key: TermKey;
  sign: 1 | -1;
}

const EXTRA = "extra:";

/** Подпись строки как ключ: пробелы схлопнуты, регистр сохранён для показа */
export function extraKey(label: string): ExtraKey {
  return `${EXTRA}${label.trim().replace(/\s+/g, " ")}`;
}

export function isExtraKey(key: TermKey): key is ExtraKey {
  return key.startsWith(EXTRA);
}

/** Подпись слагаемого: «Всего без НДС» или «Технадзор» */
export function termLabel(key: TermKey): string {
  return isExtraKey(key) ? key.slice(EXTRA.length) : TOTAL_LABEL[key];
}

/** Одна редакция правила (F2): кто сохранил и кто подтвердил */
export interface CostRuleRevision {
  revision: number;
  terms: CostRuleTerm[];
  /** null — исходное правило системы, его никто не вводил */
  savedBy: string | null;
  savedAt: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
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
  /** Номер действующей редакции; нет — первая (данные до F2) */
  revision?: number;
  /** Редакции по порядку, последняя действует; нет — одна исходная */
  history?: CostRuleRevision[];
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
  if (terms.length === 0) return "Ничего не выбрано";
  return terms
    .map((term, i) => {
      const label = termLabel(term.key);
      if (i === 0) return term.sign === 1 ? label : `минус ${label.toLowerCase()}`;
      return `${term.sign === 1 ? "плюс" : "минус"} ${label.toLowerCase()}`;
    })
    .join(" ");
}

export type RuleResult = { ok: true; kopecks: number } | { ok: false; missing: TermKey[] };

const sameLabel = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/** Строка сметы под слагаемым: итог или строка ниже «ВСЕГО»; null — в смете её нет */
export function termSource(
  key: TermKey,
  totals: Partial<Record<TotalKey, Sourced>>,
  extras: readonly EstimateExtra[] = [],
): Sourced | null {
  if (!isExtraKey(key)) return totals[key] ?? null;
  const label = termLabel(key);
  const found = extras.find((e) => sameLabel(e.label, label));
  return found ? { kopecks: found.kopecks, row: found.row } : null;
}

/** Применить правило к итогам сметы. Нет нужной строки — нет числа, а не ноль */
export function applyRule(
  totals: Partial<Record<TotalKey, Sourced>>,
  terms: CostRuleTerm[],
  extras: readonly EstimateExtra[] = [],
): RuleResult {
  if (terms.length === 0) return { ok: false, missing: [] };
  const sources = terms.map((t) => termSource(t.key, totals, extras));
  const missing = terms.filter((_, i) => !sources[i]).map((t) => t.key);
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, kopecks: terms.reduce((a, t, i) => a + t.sign * sources[i]!.kopecks, 0) };
}

/** Живой пример правила на смете (F2): каждое слагаемое с суммой и строкой, итог */
export interface RuleExample {
  terms: { key: TermKey; label: string; sign: 1 | -1; source: Sourced | null }[];
  result: RuleResult;
}

export function ruleExample(
  version: Pick<EstimateVersion, "totals" | "extras">,
  terms: CostRuleTerm[],
): RuleExample {
  const extras = version.extras ?? [];
  return {
    terms: terms.map((t) => ({
      key: t.key,
      label: termLabel(t.key),
      sign: t.sign,
      source: termSource(t.key, version.totals, extras),
    })),
    result: applyRule(version.totals, terms, extras),
  };
}

/**
 * Что можно выбрать в конструкторе: итоги по порядку TOTAL_ORDER и строки ниже «ВСЕГО»
 * сметы примера, плюс слагаемые правила, которых в этой смете нет
 */
export function termChoices(
  extras: readonly EstimateExtra[],
  terms: readonly CostRuleTerm[],
): TermKey[] {
  const keys: TermKey[] = [...TOTAL_ORDER];
  for (const extra of extras) {
    const key = extraKey(extra.label);
    if (!keys.some((k) => isExtraKey(k) && sameLabel(termLabel(k), extra.label))) keys.push(key);
  }
  for (const term of terms) if (!keys.includes(term.key)) keys.push(term.key);
  return keys;
}

/** Проверка состава до сохранения: пусто, повтор, нет ни одного «плюс» */
export function validateTerms(terms: CostRuleTerm[]): string | null {
  if (terms.length === 0) return "Выберите хотя бы одну строку со знаком «плюс».";
  if (!terms.some((t) => t.sign === 1)) return "Нужна хотя бы одна строка со знаком «плюс».";
  const keys = terms.map((t) => (isExtraKey(t.key) ? t.key.toLowerCase() : t.key));
  if (new Set(keys).size !== keys.length) return "Одна строка выбрана дважды.";
  return null;
}

export function sameTerms(a: readonly CostRuleTerm[], b: readonly CostRuleTerm[]): boolean {
  return a.length === b.length && a.every((t, i) => t.key === b[i]!.key && t.sign === b[i]!.sign);
}

/** Редакции правила; у данных до F2 истории нет — одна исходная из полей правила */
export function ruleHistory(rule: CostRule): CostRuleRevision[] {
  if (rule.history?.length) return rule.history;
  return [
    {
      revision: rule.revision ?? 1,
      terms: rule.terms,
      savedBy: null,
      savedAt: null,
      confirmedBy: rule.confirmedBy,
      confirmedAt: rule.confirmedAt,
    },
  ];
}

/**
 * Новая редакция (F2): состав меняется, статус «Требует согласования» до подтверждения
 * менеджером. `current` — действующее правило того же уровня (компания или объект) или null
 */
export function reviseRule(
  current: CostRule | null,
  input: { objectId: string | null; terms: CostRuleTerm[] },
  by: string,
  at: string,
): CostRule {
  const history = current ? ruleHistory(current) : [];
  const revision = (history.at(-1)?.revision ?? 0) + 1;
  return {
    id: input.objectId ? `rule-${input.objectId}` : "rule-company",
    objectId: input.objectId,
    terms: input.terms,
    status: "needs-agreement",
    confirmedBy: null,
    confirmedAt: null,
    revision,
    history: [
      ...history,
      {
        revision,
        terms: input.terms,
        savedBy: by,
        savedAt: at,
        confirmedBy: null,
        confirmedAt: null,
      },
    ],
  };
}

/** Подтвердить действующую редакцию */
export function confirmRule(rule: CostRule, by: string, at: string): CostRule {
  const history = ruleHistory(rule);
  return {
    ...rule,
    status: "confirmed",
    confirmedBy: by,
    confirmedAt: at,
    revision: history.at(-1)!.revision,
    history: history.map((r, i) =>
      i === history.length - 1 ? { ...r, confirmedBy: by, confirmedAt: at } : r,
    ),
  };
}

/**
 * Отмена последней редакции (тост 6 секунд): правило до неё. null — редакция была первой
 * своим уровнем: правило объекта снимается, у компании остаётся исходное
 */
export function revertRule(rule: CostRule): CostRule | null {
  const history = ruleHistory(rule);
  if (history.length < 2) return rule.objectId === null ? DEFAULT_COMPANY_RULE : null;
  const kept = history.slice(0, -1);
  const last = kept.at(-1)!;
  return {
    ...rule,
    terms: last.terms,
    status: last.confirmedAt ? "confirmed" : "needs-agreement",
    confirmedBy: last.confirmedBy,
    confirmedAt: last.confirmedAt,
    revision: last.revision,
    history: kept,
  };
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
  /** Строки ниже «ВСЕГО по смете» (F4); нет — версия до F4 */
  extras?: EstimateExtra[];
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
  const result = applyRule(version.totals, rule.terms, version.extras ?? []);
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
  /** Записи, у которых поменялась сумма: было, стало. Подтверждённые без суммы — тоже здесь */
  changed: { id: string; from: number | null; to: number }[];
  /** Подтверждённые записи, чья доля по новой версии не совпала с их суммой */
  confirmedMismatch: string[];
  /** Неподтверждённые записи без суммы: долю получат при проверке */
  waiting: number;
  /** Записи закрытой недели: не меняются до переоткрытия */
  locked: number;
}

/**
 * Пересчитать суммы записей объекта по новой стоимости. Доли считаются по всем
 * неотклонённым записям объекта. Получают долю:
 * - неподтверждённые с суммой (сумма меняется);
 * - подтверждённые без суммы (F4): проверены, пока у объекта не было сметы. Это первая сумма,
 *   а не правка подтверждённой: иначе факт объекта так и остался бы без стоимости.
 * Неподтверждённая без суммы получит долю при подтверждении. Подтверждённая с суммой
 * не меняется, расхождение возвращается отдельно, чтобы пометить отчёт. Закрытая неделя
 * (`isLocked`) не меняется вовсе.
 */
export function recalcObject(
  entries: TimeEntry[],
  objectId: string,
  costRub: number,
  isLocked: (day: string) => boolean = () => false,
): Recalc {
  const own = entries.filter((e) => e.objectId === objectId && e.status !== "rejected");
  const shares = allocateByMinutes(
    costRub,
    own.map((e) => ({ id: e.id, minutes: e.minutes })),
  );
  const changed: Recalc["changed"] = [];
  const confirmedMismatch: string[] = [];
  let waiting = 0;
  let locked = 0;
  const next = entries.map((e) => {
    const share = shares.get(e.id);
    if (share === undefined) return e;
    if (isLocked(e.day)) {
      if (e.amountRub !== share) locked++;
      return e;
    }
    if (e.status === "confirmed") {
      if (e.amountRub === null) {
        changed.push({ id: e.id, from: null, to: share });
        return { ...e, amountRub: share };
      }
      if (e.amountRub !== share) confirmedMismatch.push(e.id);
      return e;
    }
    // Запись без суммы получает долю при подтверждении (ADR-043): здесь её не трогаем,
    // иначе сумма появилась бы до решения менеджера
    if (e.amountRub === null) {
      waiting++;
      return e;
    }
    if (e.amountRub === share) return e;
    changed.push({ id: e.id, from: e.amountRub, to: share });
    return { ...e, amountRub: share };
  });
  return { entries: next, changed, confirmedMismatch, waiting, locked };
}

/**
 * Тост после подтверждения сметы или смены правила (F4): число пересчитанных записей,
 * а если ноль — почему ноль
 */
export function recalcNote(r: {
  changed: number;
  waiting: number;
  locked: number;
  /** Подтверждённые с суммой, которая не совпала с новой долей */
  kept: number;
}): string {
  const tail = [
    r.waiting ? `ждут проверки и получат стоимость при ней: ${r.waiting}` : null,
    r.kept ? `проверенные с суммой сохранили её: ${r.kept}` : null,
    r.locked ? `в закрытой неделе не меняются: ${r.locked}` : null,
  ].filter(Boolean);
  if (r.changed > 0 || tail.length > 0) {
    // Ноль с причиной: «у объекта нет проверенных записей недели» и что с остальными
    const zero =
      r.changed === 0 && r.waiting > 0 && !r.kept
        ? ", у объекта нет проверенных записей недели"
        : "";
    return `Пересчитано записей: ${r.changed}${zero}${tail.length ? `; ${tail.join(", ")}` : ""}`;
  }
  return "Пересчитано записей: 0, у объекта нет записей с фактом";
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

/** «норма 40,1 чел.-ч, факт 41,5 ч» */
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
