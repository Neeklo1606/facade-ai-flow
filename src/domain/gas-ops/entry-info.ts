/**
 * Четыре типа сведений о записи (ADR-061, 10; раздел 2.3 документа табеля): состояние,
 * ошибка данных, подозрение, полнота финансов. Это разные поля и разные счётчики: у одной
 * записи может быть ошибка и два подозрения сразу, поэтому счётчики не складываются.
 *
 * Здесь же правила «неизвестное не ноль» (человеко-часы без состава не считаются нулём)
 * и расшифровка суммы: источник, формула словами и сумма на час длительности.
 */
import { formatClock, fmtRub } from "./calc";
import { fmtManHours, headcountOf, manMinutesOf } from "./crew";
import { FLAG_LABEL, type EntryStatus, type TimeEntry } from "./model";
import type { EntryView } from "./view";

export type InfoKind = "error" | "suspicion" | "finance";

export const INFO_KIND_LABEL: Record<InfoKind, string> = {
  error: "Ошибка данных",
  suspicion: "Подозрение",
  finance: "Полнота финансов",
};

export type RemarkKey =
  // Ошибки данных
  | "no-crew"
  | "bad-interval"
  | "zero-minutes"
  // Подозрения
  | "duplicate"
  | "overlap"
  | "repeat-visit"
  | "late-entry"
  | "over-crew"
  | "high-rate"
  // Полнота финансов
  | "no-cost"
  | "no-amount"
  | "manual-amount"
  | "needs-agreement"
  | "multi-day-object";

export const REMARK_KIND: Record<RemarkKey, InfoKind> = {
  "no-crew": "error",
  "bad-interval": "error",
  "zero-minutes": "error",
  duplicate: "suspicion",
  overlap: "suspicion",
  "repeat-visit": "suspicion",
  "late-entry": "suspicion",
  "over-crew": "suspicion",
  "high-rate": "suspicion",
  "no-cost": "finance",
  "no-amount": "finance",
  "manual-amount": "finance",
  "needs-agreement": "finance",
  "multi-day-object": "finance",
};

export const REMARK_LABEL: Record<RemarkKey, string> = {
  "no-crew": "Нет состава",
  "bad-interval": "Неверный интервал",
  "zero-minutes": "Ноль минут",
  duplicate: FLAG_LABEL.duplicate,
  overlap: FLAG_LABEL.overlap,
  "repeat-visit": FLAG_LABEL["repeat-visit"],
  "late-entry": "Внесено позже",
  "over-crew": FLAG_LABEL["over-crew"],
  "high-rate": FLAG_LABEL["high-rate"],
  "no-cost": "Нет подтверждённой стоимости",
  "no-amount": FLAG_LABEL["no-amount"],
  "manual-amount": "Ручная сумма",
  "needs-agreement": "Требует согласования",
  "multi-day-object": FLAG_LABEL["multi-day-object"],
};

/** Порядок внутри типа: от того, что сильнее мешает, к тихому */
const ORDER: RemarkKey[] = [
  "zero-minutes",
  "bad-interval",
  "no-crew",
  "duplicate",
  "overlap",
  "over-crew",
  "repeat-visit",
  "late-entry",
  "high-rate",
  "no-cost",
  "no-amount",
  "manual-amount",
  "needs-agreement",
  "multi-day-object",
];

/**
 * Замечание по записи для блока «Что проверить»: что обнаружено, на каких данных,
 * что делать и мешает ли оно принять запись.
 */
export interface Remark {
  key: RemarkKey;
  kind: InfoKind;
  label: string;
  found: string;
  data: string;
  todo: string;
  /**
   * Запрещает принять запись. Такое правило держит порт (ноль минут); остальные замечания
   * только исключают запись из «Принять N без замечаний», решение за менеджером
   */
  blocksAccept: boolean;
}

export interface EntryInfo {
  state: EntryStatus;
  errors: Remark[];
  suspicions: Remark[];
  finance: Remark[];
}

const clock = (minutes: number | null) => (minutes === null ? "–" : formatClock(minutes));

/** «08:00–17:00, перерыв 60 мин, 480 мин» */
function frameData(entry: TimeEntry): string {
  const frame =
    entry.startMinutes === null || entry.endMinutes === null
      ? "без рамки смены"
      : `${clock(entry.startMinutes)}–${clock(entry.endMinutes)}`;
  return `${frame}, перерыв ${entry.breakMinutes} мин, ${entry.minutes} мин`;
}

/** Интервал противоречит минутам: окончание не позже начала или минуты не сходятся с рамкой */
export function badInterval(entry: TimeEntry): boolean {
  const { startMinutes: start, endMinutes: end } = entry;
  if (start === null || end === null) return false;
  if (end <= start) return true;
  if (entry.people && entry.people.length > 0) return false;
  return end - start - entry.breakMinutes !== entry.minutes;
}

function remark(
  key: RemarkKey,
  text: { found: string; data: string; todo: string },
  blocksAccept = false,
): Remark {
  return { key, kind: REMARK_KIND[key], label: REMARK_LABEL[key], ...text, blocksAccept };
}

/** Замечания записи по четырём типам. Состояние – отдельное поле, не замечание */
export function entryInfo(view: EntryView): EntryInfo {
  const { entry } = view;
  const list: Remark[] = [];
  const flags = new Set(view.flags);
  const fromReport = entry.source === "fact-report" || entry.channel === "import";
  const brigade = view.brigade?.name ?? "бригада";

  /* ---------- Ошибки данных ---------- */
  if (entry.minutes === 0)
    list.push(
      remark(
        "zero-minutes",
        {
          found: "После вычета перерыва времени не осталось.",
          data: frameData(entry),
          todo: "Исправьте время или отклоните запись: с нулём минут её принять нельзя.",
        },
        true,
      ),
    );
  if (badInterval(entry))
    list.push(
      remark("bad-interval", {
        found: "Начало, окончание и перерыв не сходятся с минутами записи.",
        data: frameData(entry),
        todo: "Сверьте время с бригадиром и исправьте запись.",
      }),
    );
  // В отчёте заказчика состава нет совсем: это свойство выгрузки, а не ошибка записи
  if (!fromReport && headcountOf(entry) === null)
    list.push(
      remark("no-crew", {
        found: "Бригадир не указал, сколько людей работало.",
        data: `${brigade}, ${entry.minutes} мин, состав пуст`,
        todo: "Человеко-часы не считаются. Исправьте состав или верните на уточнение.",
      }),
    );

  /* ---------- Подозрения ---------- */
  if (flags.has("duplicate"))
    list.push(
      remark("duplicate", {
        found: "У бригады уже есть запись с тем же объектом, днём и временем.",
        data: `${frameData(entry)}; совпадает с ${view.duplicates.map((d) => d.number).join(", ") || "другой записью"}`,
        todo: "Сравните записи. Если время внесено дважды, отклоните лишнюю.",
      }),
    );
  if (flags.has("overlap"))
    list.push(
      remark("overlap", {
        found: "Время пересекается с другой записью этой же бригады в тот же день.",
        data:
          view.overlaps.map((o) => `${o.number} на ${o.minutes} мин`).join(", ") ||
          "пересечение по бригаде и дню",
        todo: "Сравните записи и уточните у бригадира, где бригада была на самом деле.",
      }),
    );
  if (flags.has("over-crew"))
    list.push(
      remark("over-crew", {
        found: "В записи больше людей, чем в составе бригады на эту дату.",
        data: `${headcountOf(entry) ?? "?"} чел. в записи`,
        todo: "Уточните состав у бригадира или добавьте человека в справочник.",
      }),
    );
  if (flags.has("repeat-visit"))
    list.push(
      remark("repeat-visit", {
        found: "Бригада была на этом объекте ещё раз в тот же день, интервалы разные.",
        data: `другие выезды: ${view.repeats.map((r) => r.number).join(", ") || "есть"}`,
        todo: "Несколько выездов разрешены. Сверьте с бригадиром, если сомневаетесь.",
      }),
    );
  if (entry.createdAt.slice(0, 10) > entry.day)
    list.push(
      remark("late-entry", {
        found: "Время внесено позже дня работы.",
        data: `работа ${entry.day}, внесено ${entry.createdAt.slice(0, 10)}`,
        todo: "Бригадир вспоминал, а не записывал: сверьте с нарядом.",
      }),
    );
  if (flags.has("high-rate"))
    list.push(
      remark("high-rate", {
        found: "Сумма на час длительности выше 20 000 ₽.",
        data: view.revenue === null ? "–" : `${fmtRub(view.revenue)} на час длительности`,
        todo: "В отчёте заказчика такие строки есть: посмотрите, но это не ошибка.",
      }),
    );

  /* ---------- Полнота финансов ---------- */
  // Ждёт проверки, а стоимость подтверждена: сумма начислится при принятии, «нет суммы» тут неверно
  const amountOnAccept =
    entry.amountRub === null &&
    entry.status !== "confirmed" &&
    view.estimate?.status === "confirmed";
  if (flags.has("no-estimate"))
    list.push(
      remark("no-cost", {
        found: "У объекта нет подтверждённой стоимости работ.",
        data: view.estimate
          ? `стоимость объекта: ${view.estimate.status === "manual-pending" ? "ручная, ждёт подтверждения" : "не передана"}`
          : "сметы нет",
        todo: "Принять запись можно. Стоимость подтверждает менеджер в «Стоимость работ».",
      }),
    );
  if (flags.has("no-amount") && !amountOnAccept)
    list.push(
      remark("no-amount", {
        found: "По записи есть время, но нет суммы.",
        data: `${entry.minutes} мин, сумма пуста`,
        todo: "Сумма появится, когда у объекта будет подтверждённая стоимость.",
      }),
    );
  if (view.amountOrigin === "manual")
    list.push(
      remark("manual-amount", {
        found: "Сумма введена менеджером вручную: у объекта нет сметы.",
        data: entry.amountRub === null ? "–" : fmtRub(entry.amountRub),
        todo: "Проверьте сумму перед закрытием недели.",
      }),
    );
  if (view.estimate?.status === "manual-pending")
    list.push(
      remark("needs-agreement", {
        found: "Стоимость работ объекта ждёт ручного подтверждения.",
        data: view.estimate.note ?? "ручная стоимость",
        todo: "Правило распределения согласует заказчик.",
      }),
    );
  if (flags.has("multi-day-object"))
    list.push(
      remark("multi-day-object", {
        found: "По объекту работали несколько дней.",
        data: `стоимость объекта делится по минутам: ${view.objectMinutes} мин всего`,
        todo: "Для сведения: правило распределения согласует заказчик.",
      }),
    );

  list.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return {
    state: entry.status,
    errors: list.filter((r) => r.kind === "error"),
    suspicions: list.filter((r) => r.kind === "suspicion"),
    finance: list.filter((r) => r.kind === "finance"),
  };
}

/** Все замечания записи подряд: ошибки, подозрения, финансы */
export function remarksOf(info: EntryInfo): Remark[] {
  return [...info.errors, ...info.suspicions, ...info.finance];
}

/**
 * «Без замечаний» для массового принятия: нет ошибок данных и подозрений. Полнота финансов
 * сюда не входит: принять запись и подтвердить стоимость объекта – разные действия (2.3, п. 6)
 */
export function isClean(info: EntryInfo): boolean {
  return info.errors.length === 0 && info.suspicions.length === 0;
}

/** Запись нельзя принять, пока не исправлена (правило порта) */
export function acceptBlocker(info: EntryInfo): Remark | null {
  return remarksOf(info).find((r) => r.blocksAccept) ?? null;
}

/** Финансовые сведения, которые не говорят о неполноте: только для сведения */
const FINANCE_NOTES = new Set<RemarkKey>(["multi-day-object"]);

export interface InfoCounts {
  state: Record<EntryStatus, number>;
  /**
   * Сколько записей с хотя бы одной ошибкой, подозрением, неполными финансами. «Объект на
   * несколько дней» – сведение о распределении, а не неполнота: в счётчик финансов не входит
   */
  errors: number;
  suspicions: number;
  finance: number;
  /** Записи без ошибок и подозрений среди ждущих проверки */
  clean: number;
}

/** Счётчики по типам: каждый считает записи своего типа, сумма счётчиков смысла не имеет */
export function infoCounts(views: EntryView[]): InfoCounts {
  const state: Record<EntryStatus, number> = {
    draft: 0,
    pending: 0,
    confirmed: 0,
    rejected: 0,
    clarify: 0,
  };
  let errors = 0;
  let suspicions = 0;
  let finance = 0;
  let clean = 0;
  for (const view of views) {
    const info = entryInfo(view);
    state[info.state] += 1;
    if (info.errors.length) errors += 1;
    if (info.suspicions.length) suspicions += 1;
    if (info.finance.some((r) => !FINANCE_NOTES.has(r.key))) finance += 1;
    if (info.state === "pending" && isClean(info)) clean += 1;
  }
  return { state, errors, suspicions, finance, clean };
}

/* ---------------------------------------------------------- Неизвестное не ноль */

export interface ManHours {
  /** Человеко-минуты записей, где состав известен */
  minutes: number;
  /** Записей всего и без состава */
  total: number;
  missing: number;
}

export function manHours(entries: Pick<TimeEntry, "minutes" | "headcount" | "people">[]): ManHours {
  let minutes = 0;
  let missing = 0;
  for (const entry of entries) {
    const man = manMinutesOf(entry);
    if (man === null) missing += 1;
    else minutes += man;
  }
  return { minutes, total: entries.length, missing };
}

/**
 * Подпись человеко-часов без подмены неизвестного нулём. Значение null – «не рассчитано»:
 * ни у одной записи нет состава. Иначе значение по известным и причина про остальные.
 */
export function manHoursText(value: ManHours): {
  value: string | null;
  reason: string | null;
} {
  if (value.total === 0) return { value: null, reason: "записей нет" };
  const reason = value.missing
    ? `в ${value.missing} ${value.missing % 10 === 1 && value.missing % 100 !== 11 ? "записи" : "записях"} нет состава`
    : null;
  if (value.missing === value.total) return { value: null, reason };
  return { value: fmtManHours(value.minutes, "чел.-ч"), reason };
}

/* ---------------------------------------------------------- Расшифровка суммы */

export interface CostBreakdown {
  /** Сумма записи или ожидаемая при принятии; null – суммы нет */
  amountRub: number | null;
  expected: boolean;
  /** «смета объекта, версия 3, подтвердил Иванов 01.10» */
  source: string;
  /** Формула словами */
  formula: string;
  durationMinutes: number;
  /** Сумма на час длительности; это не стоимость человеко-часа */
  perHour: number | null;
}

function share(amount: number, minutes: number, total: number): number {
  return total > 0 ? Math.round((amount * minutes) / total) : 0;
}

const hoursWords = (minutes: number) =>
  `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} мин`;

/**
 * Откуда сумма и как посчитана (2.3, п. 4). Пример: «19 950 ₽ · смета объекта, версия 3 ·
 * длительность 2 ч 30 мин · 7 980 ₽ на час длительности».
 */
export function costBreakdown(view: EntryView, confirmedBy: string | null = null): CostBreakdown {
  const { entry, estimate } = view;
  const confirmed = estimate?.status === "confirmed" ? estimate : null;
  const expected = entry.amountRub === null && confirmed !== null && entry.status !== "confirmed";
  const total = view.objectMinutes || entry.minutes;
  const amountRub =
    entry.amountRub ?? (expected ? share(confirmed!.amountRub, entry.minutes, total) : null);
  const perHour =
    amountRub !== null && entry.minutes > 0 ? Math.round(amountRub / (entry.minutes / 60)) : null;
  const by = confirmedBy ? `, подтвердил ${confirmedBy}` : "";

  let source: string;
  let formula: string;
  if (view.amountOrigin === "entry" && entry.source === "fact-report") {
    source = `недельный отчёт заказчика${entry.excelRow ? `, строка ${entry.excelRow}` : ""}`;
    formula = "Сумма взята из отчёта заказчика как есть.";
  } else if (view.amountOrigin === "manual" || estimate?.origin === "manual") {
    source = `ручная стоимость менеджера${estimate?.status === "manual-pending" ? ", ждёт подтверждения" : ""}`;
    formula = estimate
      ? `Доля ручной стоимости объекта ${fmtRub(estimate.amountRub)} по минутам: ${entry.minutes} из ${total} мин.`
      : "Сумма введена вручную.";
  } else if (confirmed) {
    source = `смета объекта, версия ${confirmed.version}${by}`;
    formula = `Доля стоимости объекта ${fmtRub(confirmed.amountRub)} по минутам: ${entry.minutes} из ${total} мин${expected ? ", начислится при принятии" : ""}.`;
  } else {
    source = "нет подтверждённой стоимости объекта";
    formula = "Сумма не считается, пока стоимость объекта не подтверждена.";
  }
  return {
    amountRub,
    expected,
    source,
    formula,
    durationMinutes: entry.minutes,
    perHour,
  };
}

/** «19 950 ₽ · смета объекта, версия 3 · длительность 2 ч 30 мин · 7 980 ₽ на час длительности» */
export function costLine(cost: CostBreakdown): string {
  if (cost.amountRub === null) return `Не рассчитано · ${cost.source}`;
  return [
    `${cost.expected ? "≈ " : ""}${fmtRub(cost.amountRub)}`,
    cost.source,
    `длительность ${hoursWords(cost.durationMinutes)}`,
    cost.perHour === null ? null : `${fmtRub(cost.perHour)} на час длительности`,
  ]
    .filter(Boolean)
    .join(" · ");
}
