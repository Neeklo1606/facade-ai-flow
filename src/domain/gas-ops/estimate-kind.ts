/**
 * Тип сметы и роль раздела (ADR-089, ADR-090, `docs/customer/estimate-types.md`).
 *
 * Отчёту выработки нужны не все разделы сметы. По звонкам и ответам заказчика (24.11.2026):
 * - «Монтаж стальных газопроводов» (сталь) — в отчёт: итого по разделу минус материалы;
 * - испытания (опрессовка) — отдельным разделом отчёта у трёх видов работ: вынос газопровода,
 *   газификация нежилых помещений, газ-ввод и устройство арки на распределительном
 *   газопроводе. В простой смете опрессовка входит в сталь;
 * - земля и полиэтилен — в отчёт, их выполняют бригады № 2 и № 5;
 * - «Субподрядные работы», «Корректировки для загрузки», раздел без названия — не работы бригад;
 * - другие названные разделы — не в отчёт, пока заказчик не скажет иначе.
 */

export type SectionRole =
  "steel" | "pressure" | "pressure-in-steel" | "earth-pe" | "other-work" | "not-work";

export type EstimateKind = "steel" | "steel-pressure" | "underground" | "unknown";

export const SECTION_ROLE_LABEL: Record<SectionRole, string> = {
  steel: "Сталь · в отчёт",
  pressure: "Испытания · в отчёт отдельным разделом",
  "pressure-in-steel": "Испытания · в отчёт вместе со сталью",
  "earth-pe": "Земля и П/Э · в отчёт, бригады № 2 и № 5",
  "other-work": "Другие работы · не в отчёт",
  "not-work": "Не работы бригад",
};

export const ESTIMATE_KIND_LABEL: Record<EstimateKind, string> = {
  steel: "Смета на сталь",
  "steel-pressure": "Смета на сталь и испытания",
  underground: "Подземный газопровод: земля, полиэтилен, сталь",
  unknown: "Тип сметы не определён",
};

/** Бригады, которые выполняют землю и полиэтилен (ответ заказчика 24.11.2026) */
export const EARTH_PE_BRIGADES: readonly string[] = ["2", "5"];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Название без «Раздел 3»: по нему и судим */
function bareTitle(title: string): string {
  return norm(title)
    .replace(/^раздел\s*\d+[.:]?\s*/, "")
    .trim();
}

const EARTH_PE = /земл|грунт|траншея|полиэтилен|п\/э/;

/**
 * Опрессовка отдельным разделом: вынос газопровода, газификация нежилых помещений,
 * газ-ввод (газопровод-ввод) и устройство арки на распределительном газопроводе.
 * Вид работ берётся из шапки сметы; нет шапки — опрессовка входит в сталь
 */
export function pressureSeparate(workText: string | null | undefined): boolean {
  if (!workText) return false;
  const t = norm(workText);
  return (
    /вынос\S*\s+(\S+\s+)?газопровод/.test(t) ||
    /газификац\S*\s+нежил/.test(t) ||
    /газопровод\S*[-\s]ввод|газ-?ввод/.test(t) ||
    /устройств\S*\s+арк/.test(t)
  );
}

export function sectionRole(title: string, separatePressure = false): SectionRole {
  const t = bareTitle(title);
  if (!t) return "not-work";
  if (/субподряд|корректировк|прочие затраты|пусконалад/.test(t)) return "not-work";
  if (/испытан|опрессов/.test(t)) return separatePressure ? "pressure" : "pressure-in-steel";
  if (EARTH_PE.test(t)) return "earth-pe";
  // \b не работает с кириллицей: «сталь» отдельным словом или «стальных»
  if (/стальн|(^|\s)сталь(\s|$)/.test(t)) return "steel";
  return "other-work";
}

export function estimateKind(titles: readonly string[]): EstimateKind {
  const roles = titles.map((t) => sectionRole(t));
  if (!roles.includes("steel")) return "unknown";
  if (roles.includes("earth-pe")) return "underground";
  return roles.includes("pressure-in-steel") ? "steel-pressure" : "steel";
}

/** Идёт ли раздел в отчёт выработки */
export function inReport(role: SectionRole): boolean {
  return (
    role === "steel" || role === "pressure" || role === "pressure-in-steel" || role === "earth-pe"
  );
}

/** Подсказка рядом с разделом: что с ним делать */
export function roleNote(role: SectionRole): string | null {
  if (role === "pressure") return "Отдельный раздел отчёта: назначьте ту же бригаду, что и сталь";
  if (role === "pressure-in-steel")
    return "В простой смете опрессовка входит в сталь: назначьте ту же бригаду";
  if (role === "earth-pe") return "Землю и полиэтилен выполняют бригады № 2 и № 5";
  if (role === "not-work") return "Не работы бригад: в отчёт выработки не идёт";
  if (role === "other-work") return "Вид работ не согласован с заказчиком: в отчёт не идёт";
  return null;
}

/** Подсказка к типу сметы с учётом вида работ */
export function kindHint(kind: EstimateKind, separate: boolean): string {
  const pressure = separate
    ? "испытания отдельным разделом той же бригады"
    : "испытания, если есть, входят в сталь";
  if (kind === "unknown")
    return "Раздела стали не нашли. Проверьте файл: в отчёт ничего не пойдёт, пока разделы не назначены вручную.";
  if (kind === "underground")
    return `В отчёт идут сталь (итого минус материалы), земля и полиэтилен (бригады № 2 и № 5); ${pressure}.`;
  return `В отчёт идёт сталь: итого по разделу минус материалы; ${pressure}.`;
}

/** Подходит ли бригада под раздел: земля и П/Э — бригады № 2 и № 5 */
export function recommendedBrigade(
  role: SectionRole,
  brigade: { name: string; code: string },
): boolean {
  if (role !== "earth-pe") return false;
  const numbers = `${brigade.code} ${brigade.name}`.match(/\d+/g) ?? [];
  return numbers.some((n) => EARTH_PE_BRIGADES.includes(n));
}

export interface ClassifiedSection {
  key: string;
  role: SectionRole;
  report: boolean;
  note: string | null;
}

/** Роли всех разделов сметы: тип зависит от соседних разделов, опрессовка — от вида работ */
export function classifySections(
  sections: readonly { key: string; title: string }[],
  workText?: string | null,
): {
  kind: EstimateKind;
  separatePressure: boolean;
  hint: string;
  sections: ClassifiedSection[];
} {
  const kind = estimateKind(sections.map((s) => s.title));
  const separatePressure = pressureSeparate(workText);
  return {
    kind,
    separatePressure,
    hint: kindHint(kind, separatePressure),
    sections: sections.map((s) => {
      const role = sectionRole(s.title, separatePressure);
      return { key: s.key, role, report: inReport(role), note: roleNote(role) };
    }),
  };
}

/** Вид работ из шапки сметы: по нему решается, отдельна ли опрессовка */
export function workTextOf(
  header:
    { workKind: { value: string | null }; works: { value: string | null } } | null | undefined,
): string | null {
  return header?.workKind.value ?? header?.works.value ?? null;
}
