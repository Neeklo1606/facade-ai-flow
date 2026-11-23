/**
 * Тип сметы и роль раздела (ADR-089, `docs/customer/estimate-types.md`).
 *
 * Отчёту выработки нужны не все разделы сметы. По звонкам с заказчиком:
 * - «Монтаж стальных газопроводов» (сталь) — в отчёт: итого по разделу минус материалы;
 * - «Испытания» (опрессовка) — в отчёт отдельной строкой той же бригады;
 * - земля, полиэтилен и другие работы — другим бригадам и другому ответственному;
 * - «Субподрядные работы», «Корректировки для загрузки», раздел без названия — не работы бригад.
 *
 * У подземного газопровода (есть земля или полиэтилен) испытания отделу не относятся:
 * «это потом будем выяснять» — помечаем, а не угадываем.
 */

export type SectionRole = "steel" | "pressure" | "other-work" | "not-work";

export type EstimateKind = "steel" | "steel-pressure" | "underground" | "unknown";

export const SECTION_ROLE_LABEL: Record<SectionRole, string> = {
  steel: "Сталь · в отчёт",
  pressure: "Испытания · в отчёт отдельной строкой",
  "other-work": "Другие работы · другим бригадам",
  "not-work": "Не работы бригад",
};

export const ESTIMATE_KIND_LABEL: Record<EstimateKind, string> = {
  steel: "Смета на сталь",
  "steel-pressure": "Смета на сталь и испытания",
  underground: "Подземный газопровод: земля, полиэтилен, сталь",
  unknown: "Тип сметы не определён",
};

export const ESTIMATE_KIND_HINT: Record<EstimateKind, string> = {
  steel: "В отчёт идёт раздел стали: итого по разделу минус материалы.",
  "steel-pressure":
    "В отчёт идут два раздела: сталь (итого минус материалы) и испытания отдельной строкой той же бригады.",
  underground:
    "В отчёт идёт только сталь. Земля и полиэтилен — другим бригадам. Испытания подземного газопровода — уточнить у заказчика.",
  unknown:
    "Раздела стали не нашли. Проверьте файл: в отчёт ничего не пойдёт, пока разделы не назначены вручную.",
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Название без «Раздел 3»: по нему и судим */
function bareTitle(title: string): string {
  return norm(title)
    .replace(/^раздел\s*\d+[.:]?\s*/, "")
    .trim();
}

const UNDERGROUND = /земл|грунт|траншея|полиэтилен/;

export function sectionRole(title: string): SectionRole {
  const t = bareTitle(title);
  if (!t) return "not-work";
  if (/субподряд|корректировк|прочие затраты|пусконалад/.test(t)) return "not-work";
  if (/испытан|опрессов/.test(t)) return "pressure";
  if (/полиэтилен/.test(t)) return "other-work";
  // \b не работает с кириллицей: «сталь» отдельным словом или «стальных»
  if (/стальн|(^|\s)сталь(\s|$)/.test(t)) return "steel";
  return "other-work";
}

export function estimateKind(titles: readonly string[]): EstimateKind {
  const roles = titles.map(sectionRole);
  if (!roles.includes("steel")) return "unknown";
  if (titles.some((t) => UNDERGROUND.test(bareTitle(t)))) return "underground";
  return roles.includes("pressure") ? "steel-pressure" : "steel";
}

/** Идёт ли раздел в отчёт выработки отдела */
export function inReport(role: SectionRole, kind: EstimateKind): boolean {
  if (role === "steel") return true;
  if (role === "pressure") return kind !== "underground";
  return false;
}

/** Почему раздел не в отчёте: подсказка рядом с разделом */
export function outOfReportNote(role: SectionRole, kind: EstimateKind): string | null {
  if (inReport(role, kind)) return null;
  if (role === "pressure") return "Испытания подземного газопровода: уточнить у заказчика";
  if (role === "not-work") return "Не работы бригад: в отчёт выработки не идёт";
  return "Другие работы: назначаются другим бригадам";
}

export interface ClassifiedSection {
  key: string;
  role: SectionRole;
  report: boolean;
  note: string | null;
}

/** Роли всех разделов сметы разом: тип сметы зависит от соседних разделов */
export function classifySections(sections: readonly { key: string; title: string }[]): {
  kind: EstimateKind;
  sections: ClassifiedSection[];
} {
  const kind = estimateKind(sections.map((s) => s.title));
  return {
    kind,
    sections: sections.map((s) => {
      const role = sectionRole(s.title);
      return { key: s.key, role, report: inReport(role, kind), note: outOfReportNote(role, kind) };
    }),
  };
}
