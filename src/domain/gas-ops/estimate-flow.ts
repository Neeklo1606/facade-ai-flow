/**
 * Путь «смета → табель» (ADR-080).
 *
 * `intakeChecks` — итоги разбора сметы по шагам: что система нашла в файле. Это отчёт
 * о сделанном, а не анимация ожидания: каждая строка посчитана из разобранной версии.
 *
 * `objectPath` — полоса пути объекта: смета, стоимость, бригады, часы, начисление. Текущий
 * шаг — первый незакрытый, у него одно действие.
 */
import type { ObjectMatch } from "./estimate-intake";

export type CheckTone = "ok" | "warn";

export interface IntakeCheck {
  key: "header" | "sections" | "materials" | "labor" | "object";
  label: string;
  text: string;
  tone: CheckTone;
}

export interface IntakeCheckInput {
  /** Поля шапки: значение найдено или нет */
  headerFound: number;
  headerTotal: number;
  sections: readonly { materialsKopecks: number | null; laborHours: number | null }[];
  convergence: { ok: boolean; diffKopecks: number | null };
  match: ObjectMatch;
  /** Подпись найденного объекта: «3-417 · Липецк, ул. Мира, 5» */
  matchedLabel: string | null;
}

const rub = (kopecks: number) =>
  `${(kopecks / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

/** «в 3 из 7 разделов» с правильной формой слова */
function inSections(n: number, total: number): string {
  return `в ${n} из ${total} ${total === 1 ? "раздела" : "разделов"}`;
}

export function sectionsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "раздел";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "раздела";
  return "разделов";
}

export function intakeChecks(input: IntakeCheckInput): IntakeCheck[] {
  const n = input.sections.length;
  const materials = input.sections.filter((s) => s.materialsKopecks !== null).length;
  // Ноль чел.-ч — норматива нет: начисление тогда просит долю вручную (suggestBp)
  const labor = input.sections.filter((s) => s.laborHours !== null && s.laborHours > 0).length;
  const checks: IntakeCheck[] = [
    {
      key: "header",
      label: "Шапка",
      text: `найдено ${input.headerFound} из ${input.headerTotal} полей`,
      tone: input.headerFound === input.headerTotal ? "ok" : "warn",
    },
    {
      key: "sections",
      label: "Разделы",
      text:
        n === 0
          ? "разделов не нашли"
          : input.convergence.ok
            ? `${n} ${sectionsWord(n)}, сумма сходится с итогом без НДС`
            : `${n} ${sectionsWord(n)}, сумма расходится с итогом${
                input.convergence.diffKopecks !== null
                  ? ` на ${rub(Math.abs(input.convergence.diffKopecks))}`
                  : ""
              }`,
      tone: n > 0 && input.convergence.ok ? "ok" : "warn",
    },
    {
      key: "materials",
      label: "Материалы",
      text: n === 0 ? "нет разделов" : `отделены ${inSections(materials, n)}`,
      tone: n > 0 && materials === n ? "ok" : "warn",
    },
    {
      key: "labor",
      label: "Нормативные чел.-ч",
      text:
        n === 0
          ? "нет разделов"
          : labor === n
            ? `есть во всех разделах: доля выполнения посчитается по часам`
            : `есть ${inSections(labor, n)}: остальные начисляются вручную`,
      tone: n > 0 && labor === n ? "ok" : "warn",
    },
    {
      key: "object",
      label: "Объект",
      text:
        input.match.kind === "attach"
          ? `найден ${input.matchedLabel ?? "объект"} по ${
              input.match.by === "number" ? "номеру сметы" : "адресу"
            }`
          : input.match.kind === "maybe"
            ? `возможно, ${input.matchedLabel ?? "известный объект"}: проверьте`
            : "в справочнике нет: создадим новый",
      tone: input.match.kind === "maybe" ? "warn" : "ok",
    },
  ];
  return checks;
}

/* ---------------------------------------------------------------- Путь объекта */

export type PathStepKey = "estimate" | "cost" | "brigades" | "hours" | "accrual";
export type PathState = "done" | "current" | "todo";

export interface PathStep {
  key: PathStepKey;
  label: string;
  state: PathState;
  /** Подсказка шага одной строкой */
  hint: string;
}

export interface ObjectPathInput {
  sections: number;
  /** Стоимость подтверждена: версия сметы подтверждена или задана вручную */
  costConfirmed: boolean;
  /** Разделов с назначенной бригадой */
  assigned: number;
  /** Записей времени по объекту, всего и принятых */
  entries: number;
  confirmedEntries: number;
  accruedRub: number;
}

export function objectPath(input: ObjectPathInput): PathStep[] {
  const done: Record<PathStepKey, boolean> = {
    estimate: input.sections > 0,
    cost: input.costConfirmed,
    brigades: input.sections > 0 && input.assigned >= input.sections,
    hours: input.confirmedEntries > 0,
    accrual: input.accruedRub > 0,
  };
  const hints: Record<PathStepKey, string> = {
    estimate:
      input.sections > 0
        ? `${input.sections} ${sectionsWord(input.sections)} из сметы`
        : "загрузите смету: разделы появятся сами",
    cost: done.cost ? "стоимость работ подтверждена" : "проверьте суммы разделов и подтвердите",
    brigades:
      input.sections === 0 ? "после сметы" : `назначено ${input.assigned} из ${input.sections}`,
    hours:
      input.entries === 0
        ? "бригады ещё не вносили время"
        : `${input.confirmedEntries} из ${input.entries} записей приняты`,
    accrual: done.accrual ? "начисление идёт по доле разделов" : "после принятых часов",
  };
  const order: [PathStepKey, string][] = [
    ["estimate", "Смета"],
    ["cost", "Стоимость"],
    ["brigades", "Бригады"],
    ["hours", "Часы"],
    ["accrual", "Начисление"],
  ];
  const current = order.find(([key]) => !done[key])?.[0] ?? null;
  return order.map(([key, label]) => ({
    key,
    label,
    state: done[key] ? "done" : key === current ? "current" : "todo",
    hint: hints[key],
  }));
}
