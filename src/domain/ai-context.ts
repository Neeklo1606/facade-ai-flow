import type { Crew, Employee, FieldReport, Material, WorkZone } from "@/contracts";
import type { ProjectContext } from "@/ports";

/**
 * Контекст объекта для шлюза моделей (GAIKA_AI_GATEWAY.md, раздел 6; ADR-035, п. 2).
 * Модель выбирает из этих списков, а не угадывает: вид работ, участок и человека она обязана
 * взять отсюда, иначе значение приходит пустым с причиной.
 *
 * Границу данных держит эта функция: сюда не попадают ни цены, ни договоры, ни контакты,
 * ни чужие объекты. Что здесь не названо, во внешнюю модель не уходит.
 *
 * Справочника видов работ в модели пока нет (G0): виды и единицы собираются из принятых
 * и ждущих проверки отчётов объекта — это настоящие названия, которыми говорят на площадке,
 * а не выдуманный список.
 */

/** Часовой пояс площадок: один на все объекты, пока в модели объекта нет своего поля */
export const PROJECT_TIMEZONE = "Europe/Moscow";

/** Сколько номенклатуры отдаём модели: весь справочник в промпт не влезает и не нужен */
export const MATERIALS_LIMIT = 120;

export interface ContextInput {
  projectId: string;
  projectName: string;
  /** Рабочая дата объекта: от неё считаются «завтра» и «до пятницы» */
  workDate: string;
  zones: WorkZone[];
  crews: Crew[];
  team: Employee[];
  reports: FieldReport[];
  materials: Material[];
}

/** Код вида работ из названия: латиницей, чтобы модель возвращала его без искажений */
export function workTypeCode(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return slug || "work";
}

export function buildProjectContext(input: ContextInput): ProjectContext {
  const units = new Map<string, Set<string>>();
  for (const report of input.reports) {
    const key = report.workType.trim();
    if (!key) continue;
    const set = units.get(key) ?? new Set<string>();
    if (report.unit.trim()) set.add(report.unit.trim());
    units.set(key, set);
  }
  // Единицы захваток дополняют единицы отчётов: план захватки ведётся в них же
  const zoneUnits = [...new Set(input.zones.map((zone) => zone.unit.trim()).filter(Boolean))];

  const workTypes = [...units.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([name, set]) => ({
      code: workTypeCode(name),
      name,
      units: set.size > 0 ? [...set].sort() : zoneUnits.length > 0 ? zoneUnits : ["ед."],
      synonyms: [] as string[],
    }));

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    workDate: input.workDate,
    timezone: PROJECT_TIMEZONE,
    zones: input.zones.map((zone) => ({
      code: zone.id,
      name: [zone.name, zone.axes, zone.floors].filter(Boolean).join(", "),
    })),
    workTypes,
    /* Имена людей объекта — всё, что уходит о людях: ни телефонов, ни почты, ни должностей */
    people: input.team.map((person) => ({ id: person.id, name: person.name })),
    crews: input.crews.map((crew) => ({ id: crew.id, name: crew.name })),
    materials: input.materials
      .slice(0, MATERIALS_LIMIT)
      .map((material) => ({ name: material.name, unit: material.unit })),
  };
}
