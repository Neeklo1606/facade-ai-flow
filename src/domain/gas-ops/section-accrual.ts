/**
 * Начисление по доле выполнения раздела (ADR-078, промпт B брифа «три промпта до рабочего сервиса»).
 *
 * Правило владельца, сверяется с Оксаной в пилоте:
 * 1. Бригадир после отправки времени отвечает «Работы по разделу закончены?» Да / Нет.
 * 2. Система предлагает долю раздела: подтверждённые чел.-ч по разделу / нормативные т/з раздела.
 *    Пока раздел не завершён, предложение не выше 90 %. Нет норматива — предложения нет.
 * 3. Оксана принимает долю как есть или меняет; «Раздел завершён» ставит 100 %.
 * 4. Начисление = (новая доля − прежняя) × стоимость работ раздела. Внутри пакета делится
 *    между записями по минутам наибольшим остатком, целые рубли.
 * 5. Сумма начислений по разделу не больше стоимости, при 100 % равна ей до рубля.
 *    Закрытая неделя не меняется: доля и остаток считаются от уже начисленного.
 * 6. Без доли и без норматива: ручное начисление с обязательной причиной, не больше остатка.
 *
 * Доли в базисных пунктах: 10 000 = 100 %. Деньги в целых рублях, как в записях (ADR-043).
 */
import type { TimeEntry } from "./model";
import type { ObjectSection } from "./estimate-intake";
import { allocateByMinutes } from "./work-cost";

export const FULL_BP = 10_000;
/** Потолок предложения, пока раздел не завершён: остаток не съедается раньше времени */
export const SUGGEST_CAP_BP = 9_000;

/** Как считается начисление: по доле раздела (новый) или по минутам всей сметы (до ADR-078) */
export type AccrualMode = "share" | "time";

export const ACCRUAL_MODE_LABEL: Record<AccrualMode, string> = {
  share: "По доле выполнения раздела",
  time: "По времени, вся смета объекта",
};

/** Назначение раздела бригаде на период. `to` null — до отмены */
export interface SectionAssignment {
  id: string;
  objectId: string;
  sectionKey: string;
  /** «Раздел 3. Монтаж газопровода»: бригадиру без сумм раздела */
  title: string;
  brigadeId: string;
  from: string;
  to: string | null;
  by: string;
  at: string;
}

export type ProgressKind = "suggested" | "edited" | "completed" | "manual";

export const PROGRESS_KIND_LABEL: Record<ProgressKind, string> = {
  suggested: "принята предложенная доля",
  edited: "доля изменена",
  completed: "раздел завершён",
  manual: "ручное начисление",
};

/** Строка истории доли раздела: кто, когда, было, стало, причина */
export interface SectionProgress {
  id: string;
  objectId: string;
  sectionKey: string;
  fromBp: number;
  toBp: number;
  kind: ProgressKind;
  /** Записи, при подтверждении которых доля изменилась */
  entryIds: string[];
  /** Сколько начислено этим шагом, рубли */
  accruedRub: number;
  reason: string | null;
  by: string;
  at: string;
}

/** Начисление записи: раздел, доля до и после, разбивка СМР и опрессовки */
export interface EntryAccrual {
  sectionKey: string;
  mode: "share" | "manual";
  fromBp: number;
  toBp: number;
  /** Что предлагала система; null — норматива нет */
  suggestedBp: number | null;
  smrRub: number;
  pressureRub: number;
  reason: string | null;
}

/* ---------------------------------------------------------------- Назначения */

export const activeOn = (a: SectionAssignment, day: string) =>
  a.from <= day && (a.to === null || day <= a.to);

/** Разделы объекта, назначенные бригаде на день */
export function assignedSections(
  assignments: readonly SectionAssignment[],
  brigadeId: string,
  day: string,
  objectId?: string,
): SectionAssignment[] {
  return assignments.filter(
    (a) =>
      a.brigadeId === brigadeId &&
      activeOn(a, day) &&
      (objectId === undefined || a.objectId === objectId),
  );
}

/** Объекты, по которым бригаде на день назначен хотя бы один раздел */
export function assignedObjectIds(
  assignments: readonly SectionAssignment[],
  brigadeId: string,
  day: string,
): string[] {
  return [...new Set(assignedSections(assignments, brigadeId, day).map((a) => a.objectId))];
}

/**
 * Раздел для записи: один назначенный подставляется сам, выбранный проверяется по назначениям.
 * Нет назначений на объекте — раздела нет (запись идёт по старому правилу или вручную)
 */
export function sectionForEntry(
  assignments: readonly SectionAssignment[],
  input: { brigadeId: string; day: string; objectId: string; sectionKey?: string | null },
): { ok: true; sectionKey: string | null } | { ok: false; reason: string; choices: string[] } {
  const own = assignedSections(assignments, input.brigadeId, input.day, input.objectId);
  const keys = [...new Set(own.map((a) => a.sectionKey))];
  if (input.sectionKey) {
    if (keys.includes(input.sectionKey)) return { ok: true, sectionKey: input.sectionKey };
    return { ok: false, reason: "Этот раздел бригаде не назначен.", choices: keys };
  }
  if (keys.length === 0) return { ok: true, sectionKey: null };
  if (keys.length === 1) return { ok: true, sectionKey: keys[0]! };
  return { ok: false, reason: "Выберите раздел: на объекте их несколько.", choices: keys };
}

/** Пересечение назначений одного раздела одной бригаде: второе такое же не нужно */
export function overlapsAssignment(
  assignments: readonly SectionAssignment[],
  next: Pick<SectionAssignment, "objectId" | "sectionKey" | "brigadeId" | "from" | "to">,
): SectionAssignment | null {
  const end = (x: { to: string | null }) => x.to ?? "9999-12-31";
  return (
    assignments.find(
      (a) =>
        a.objectId === next.objectId &&
        a.sectionKey === next.sectionKey &&
        a.brigadeId === next.brigadeId &&
        a.from <= end(next) &&
        next.from <= end(a),
    ) ?? null
  );
}

/* ---------------------------------------------------------------- Деньги раздела */

/**
 * Стоимость объекта делится по разделам (ADR-085): режим «по доле» и у объекта есть раздел
 * со стоимостью работ. Тогда запись без раздела доли всей сметы по минутам не получает,
 * иначе она забрала бы деньги, которые уже начисляются по разделам, и сумма по объекту
 * превысила бы смету
 */
export function splitBySections(
  data: {
    objectSections?: readonly Pick<ObjectSection, "objectId" | "workKopecks" | "removed">[];
    reviewSettings?: { accrualMode?: AccrualMode } | undefined;
  },
  objectId: string,
): boolean {
  if ((data.reviewSettings?.accrualMode ?? "share") !== "share") return false;
  return (data.objectSections ?? []).some(
    (s) => s.objectId === objectId && !s.removed && s.workKopecks !== null,
  );
}

/** Стоимость работ раздела без материалов, целые рубли; null — в смете её нет */
export function sectionWorkRub(section: Pick<ObjectSection, "workKopecks">): number | null {
  return section.workKopecks === null ? null : Math.round(section.workKopecks / 100);
}

/** Человеко-минуты записи: строки людей, иначе состав × минуты, иначе минуты записи */
export function personMinutes(e: Pick<TimeEntry, "minutes" | "headcount" | "people">): number {
  if (e.people?.length) return e.people.reduce((a, p) => a + p.minutes, 0);
  if (e.headcount && e.headcount > 0) return e.headcount * e.minutes;
  return e.minutes;
}

const inSection = (e: TimeEntry, objectId: string, key: string) =>
  e.objectId === objectId && e.sectionKey === key;

/** Начислено по разделу: подтверждённые записи с начислением */
export function accruedRub(entries: readonly TimeEntry[], objectId: string, key: string): number {
  return entries
    .filter((e) => inSection(e, objectId, key) && e.status === "confirmed")
    .reduce((a, e) => a + (e.accrual ? e.accrual.smrRub + e.accrual.pressureRub : 0), 0);
}

/** Текущая доля раздела: последняя строка истории */
export function currentBp(
  progress: readonly SectionProgress[],
  objectId: string,
  key: string,
): number {
  const own = progress.filter((p) => p.objectId === objectId && p.sectionKey === key);
  return own.at(-1)?.toBp ?? 0;
}

/** Подтверждённые чел.-ч раздела в минутах, плюс записи, которые сейчас подтверждают */
export function confirmedPersonMinutes(
  entries: readonly TimeEntry[],
  objectId: string,
  key: string,
  extra: readonly TimeEntry[] = [],
): number {
  const ids = new Set(extra.map((e) => e.id));
  const confirmed = entries.filter(
    (e) => inSection(e, objectId, key) && e.status === "confirmed" && !ids.has(e.id),
  );
  return [...confirmed, ...extra].reduce((a, e) => a + personMinutes(e), 0);
}

/* ---------------------------------------------------------------- Предложение доли */

export interface Suggestion {
  /** null — норматива нет, долю вводит человек или начисляет вручную с причиной */
  bp: number | null;
  /** «по нормативу: 18,0 из 40,0 чел.-ч», «бригадир: работы закончены» */
  basis: string;
  capped: boolean;
}

const hours = (minutes: number) =>
  (minutes / 60).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Предложить долю: чел.-ч / норматив, не выше 90 % до завершения, не ниже текущей.
 * Бригадир ответил «закончены» — предложение 100 %, принимает всё равно Оксана
 */
export function suggestBp(input: {
  normHours: number | null;
  personMinutes: number;
  currentBp: number;
  done: boolean;
}): Suggestion {
  if (input.done) return { bp: FULL_BP, basis: "бригадир: работы закончены", capped: false };
  if (!input.normHours || input.normHours <= 0)
    return { bp: null, basis: "норматива т/з в смете нет", capped: false };
  const raw = Math.floor((input.personMinutes / 60 / input.normHours) * FULL_BP);
  const capped = raw > SUGGEST_CAP_BP;
  const bp = Math.max(input.currentBp, Math.min(raw, SUGGEST_CAP_BP));
  const norm = input.normHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return {
    bp,
    basis: `по нормативу: ${hours(input.personMinutes)} из ${norm} чел.-ч${capped ? ", до завершения не выше 90 %" : ""}`,
    capped,
  };
}

/* ---------------------------------------------------------------- Начисление */

/** Сколько должно быть начислено при доле: при 100 % ровно стоимость */
export function targetRub(workRub: number, bp: number): number {
  if (bp >= FULL_BP) return workRub;
  return Math.floor((workRub * Math.max(0, bp)) / FULL_BP);
}

/**
 * Начисление шага: цель при новой доле минус уже начисленное. Никогда не отрицательное
 * и не больше остатка: снижение доли не забирает начисленное в закрытых неделях
 */
export function stepRub(input: { workRub: number; accruedRub: number; toBp: number }): number {
  const remaining = Math.max(0, input.workRub - input.accruedRub);
  return Math.min(remaining, Math.max(0, targetRub(input.workRub, input.toBp) - input.accruedRub));
}

/** Проверка доли, которую ввёл человек: число процентов 0–100, до сотых */
export function parsePercent(value: string | number): number | null {
  const n = typeof value === "number" ? value : Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

export const fmtShare = (bp: number) =>
  `${(bp / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} %`;

/** СМР и опрессовка в начислении: раздел испытаний целиком — опрессовка, иначе по доле сметы */
export function splitPressure(
  rub: number,
  section: Pick<ObjectSection, "workKopecks" | "pressureKopecks">,
): { smrRub: number; pressureRub: number } {
  const work = section.workKopecks ?? 0;
  const pressure = Math.min(section.pressureKopecks ?? 0, work);
  if (work <= 0 || pressure <= 0) return { smrRub: rub, pressureRub: 0 };
  if (pressure >= work) return { smrRub: 0, pressureRub: rub };
  const pressureRub = Math.round((rub * pressure) / work);
  return { smrRub: rub - pressureRub, pressureRub };
}

/** Решение Оксаны по разделу при подтверждении */
export type AccrualDecision =
  | { kind: "share"; percent?: number | string | null | undefined; done?: boolean | undefined }
  | { kind: "manual"; amountRub: number; reason: string };

export type AccrualPlan =
  | {
      ok: true;
      fromBp: number;
      toBp: number;
      suggestedBp: number | null;
      kind: ProgressKind;
      totalRub: number;
      /** Начисление каждой записи пакета по минутам */
      perEntry: Map<string, { smrRub: number; pressureRub: number }>;
      remainingAfter: number;
      reason: string | null;
    }
  | { ok: false; reason: string };

/**
 * План начисления пакета записей одного раздела. Чистая функция: на входе всё, что знает
 * база, на выходе доля, сумма шага и разбивка по записям. Сумма шага ≤ остатка
 */
export function planAccrual(input: {
  section: Pick<ObjectSection, "workKopecks" | "pressureKopecks" | "laborHours" | "removed">;
  entries: readonly TimeEntry[];
  progress: readonly SectionProgress[];
  objectId: string;
  sectionKey: string;
  batch: readonly TimeEntry[];
  decision: AccrualDecision;
}): AccrualPlan {
  const { section, objectId, sectionKey, batch, decision } = input;
  const workRub = sectionWorkRub(section);
  if (workRub === null)
    return { ok: false, reason: "В смете нет стоимости работ раздела: начисление вручную." };
  const accrued = accruedRub(input.entries, objectId, sectionKey);
  const fromBp = currentBp(input.progress, objectId, sectionKey);
  const remaining = Math.max(0, workRub - accrued);
  const minutes = batch.map((e) => ({ id: e.id, minutes: e.minutes }));
  const spread = (total: number) => {
    const parts = allocateByMinutes(total, minutes);
    return new Map([...parts].map(([id, rub]) => [id, splitPressure(rub, section)] as const));
  };

  if (decision.kind === "manual") {
    const reason = decision.reason.trim();
    if (!reason) return { ok: false, reason: "Напишите причину ручного начисления." };
    if (!Number.isInteger(decision.amountRub) || decision.amountRub < 0)
      return { ok: false, reason: "Сумма целыми рублями, не меньше нуля." };
    if (decision.amountRub > remaining)
      return {
        ok: false,
        reason: `Больше остатка раздела: осталось ${remaining.toLocaleString("ru-RU")} ₽.`,
      };
    // Доля после ручного начисления — сколько стоимости уже начислено
    const toBp =
      workRub === 0
        ? fromBp
        : Math.max(fromBp, Math.floor(((accrued + decision.amountRub) * FULL_BP) / workRub));
    return {
      ok: true,
      fromBp,
      toBp,
      suggestedBp: null,
      kind: "manual",
      totalRub: decision.amountRub,
      perEntry: spread(decision.amountRub),
      remainingAfter: remaining - decision.amountRub,
      reason,
    };
  }

  // Ответ бригадира «закончены» — предложение 100 %, но завершает раздел только Оксана
  const done = Boolean(decision.done) || batch.some((e) => e.sectionDone === true);
  const suggestedBp = suggestBp({
    normHours: section.laborHours,
    personMinutes: confirmedPersonMinutes(input.entries, objectId, sectionKey, batch),
    currentBp: fromBp,
    done,
  }).bp;
  let toBp: number;
  let kind: ProgressKind;
  if (decision.done) {
    toBp = FULL_BP;
    kind = "completed";
  } else if (
    decision.percent !== undefined &&
    decision.percent !== null &&
    decision.percent !== ""
  ) {
    const bp = parsePercent(decision.percent);
    if (bp === null) return { ok: false, reason: "Доля числом от 0 до 100 %." };
    toBp = bp;
    kind = bp === FULL_BP ? "completed" : bp === suggestedBp ? "suggested" : "edited";
  } else if (suggestedBp !== null) {
    toBp = suggestedBp;
    kind = toBp === FULL_BP ? "completed" : "suggested";
  } else {
    return {
      ok: false,
      reason: "Норматива нет: введите долю или начислите вручную с причиной.",
    };
  }
  const totalRub = stepRub({ workRub, accruedRub: accrued, toBp });
  return {
    ok: true,
    fromBp,
    toBp,
    suggestedBp,
    kind,
    totalRub,
    perEntry: spread(totalRub),
    remainingAfter: remaining - totalRub,
    reason: null,
  };
}

/* ---------------------------------------------------------------- Карточка объекта */

export interface SectionLedger {
  key: string;
  number: string | null;
  title: string;
  workRub: number | null;
  accruedRub: number;
  remainingRub: number | null;
  bp: number;
  brigadeIds: string[];
  laborHours: number | null;
  personMinutes: number;
  pressure: boolean;
  history: SectionProgress[];
}

/** Разделы объекта: стоимость, начислено, остаток, доля, бригады, история */
export function sectionLedger(input: {
  objectId: string;
  sections: readonly ObjectSection[];
  entries: readonly TimeEntry[];
  progress: readonly SectionProgress[];
  assignments: readonly SectionAssignment[];
}): SectionLedger[] {
  return input.sections
    .filter((s) => s.objectId === input.objectId && !s.removed)
    .map((s) => {
      const workRub = sectionWorkRub(s);
      const accrued = accruedRub(input.entries, input.objectId, s.key);
      return {
        key: s.key,
        number: s.number,
        title: s.title,
        workRub,
        accruedRub: accrued,
        remainingRub: workRub === null ? null : Math.max(0, workRub - accrued),
        bp: currentBp(input.progress, input.objectId, s.key),
        brigadeIds: [
          ...new Set(
            input.assignments
              .filter((a) => a.objectId === input.objectId && a.sectionKey === s.key)
              .map((a) => a.brigadeId),
          ),
        ],
        laborHours: s.laborHours,
        personMinutes: confirmedPersonMinutes(input.entries, input.objectId, s.key),
        pressure: (s.pressureKopecks ?? 0) > 0,
        history: input.progress.filter(
          (p) => p.objectId === input.objectId && p.sectionKey === s.key,
        ),
      };
    });
}

/** Подпись раздела: «Раздел 3. Монтаж газопровода» или название как в смете */
export function sectionLabel(s: Pick<ObjectSection, "number" | "title">): string {
  if (!s.number || s.title.toLowerCase().startsWith("раздел")) return s.title;
  return `Раздел ${s.number}. ${s.title}`;
}

/** Подписи разделов смет для отчёта и Excel: ключ записи → «Раздел 2. Монтаж…» */
export function reportSections(
  sections: readonly Pick<ObjectSection, "objectId" | "key" | "number" | "title">[],
): { objectId: string; key: string; label: string }[] {
  return sections.map((x) => ({ objectId: x.objectId, key: x.key, label: sectionLabel(x) }));
}
