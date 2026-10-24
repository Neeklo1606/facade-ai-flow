/**
 * Недельный график объектов и доступность бригад (ADR-053, раздел 4).
 *
 * График заказчика меняется почти каждый день и приходит Excel-файлом. Колонки в нём
 * не стандартизированы, поэтому человек один раз сопоставляет колонки, сопоставление
 * запоминается. Применение — по предпросмотру «добавится / изменится / уйдёт».
 */

/** Поле строки графика, которое ищется в колонках файла */
export type ScheduleField = "object" | "code" | "brigade" | "day";

export const SCHEDULE_FIELD_LABEL: Record<ScheduleField, string> = {
  object: "Объект",
  code: "Номер объекта",
  brigade: "Бригада",
  day: "День",
};

export const REQUIRED_FIELDS: ScheduleField[] = ["object", "brigade", "day"];

/** Сопоставление: поле → номер колонки (с 0); null — колонки нет */
export type ColumnMap = Record<ScheduleField, number | null>;

export interface ScheduleRow {
  /** Ключ строки: объект, бригада и день. По нему строки сравниваются между версиями */
  key: string;
  objectLabel: string;
  code: string | null;
  brigade: string;
  day: string;
  /** Строка файла, откуда взято значение */
  row: number;
}

export interface ScheduleParse {
  rows: ScheduleRow[];
  /** Строки, которые не вошли: номер строки файла и причина */
  skipped: { row: number; reason: string }[];
}

export interface ScheduleDiff {
  added: ScheduleRow[];
  /** Та же пара объект и день, но другая бригада: строка изменилась */
  changed: { from: ScheduleRow; to: ScheduleRow }[];
  removed: ScheduleRow[];
  unchanged: number;
}

/** Отметка бригады на неделю */
export type BrigadeWeekStatus = "working" | "vacation";

export const BRIGADE_WEEK_LABEL: Record<BrigadeWeekStatus, string> = {
  working: "Работает",
  vacation: "В отпуске",
};

export interface BrigadeAvailability {
  brigadeId: string;
  /** Понедельник недели, ISO */
  weekFrom: string;
  status: BrigadeWeekStatus;
}

/** Статус бригады на неделю: по умолчанию «работает» */
export function brigadeStatus(
  brigadeId: string,
  weekFrom: string,
  list: BrigadeAvailability[],
): BrigadeWeekStatus {
  return (
    list.find((a) => a.brigadeId === brigadeId && a.weekFrom === weekFrom)?.status ?? "working"
  );
}

/** Только работающие бригады недели: их видят график и бот */
export function workingBrigades<T extends { id: string }>(
  brigades: T[],
  weekFrom: string,
  list: BrigadeAvailability[],
): T[] {
  return brigades.filter((b) => brigadeStatus(b.id, weekFrom, list) === "working");
}

/** Поставить отметку: заменяет прежнюю на ту же неделю */
export function setBrigadeStatus(
  list: BrigadeAvailability[],
  next: BrigadeAvailability,
): BrigadeAvailability[] {
  return [
    ...list.filter((a) => !(a.brigadeId === next.brigadeId && a.weekFrom === next.weekFrom)),
    next,
  ];
}

/**
 * Объекты бригады на день по графику: строка графика сопоставляется с бригадой по коду или
 * имени, с объектом — по номеру или подписи. Несопоставленные строки не придумываются.
 */
export function scheduleObjectIds(
  rows: ScheduleRow[],
  brigade: { code: string; name: string },
  day: string,
  objects: { id: string; code: string; label: string }[],
): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const names = new Set([norm(brigade.code), norm(brigade.name)]);
  const ids: string[] = [];
  for (const row of rows) {
    if (row.day !== day || !names.has(norm(row.brigade))) continue;
    const object =
      (row.code ? objects.find((o) => norm(o.code) === norm(row.code!)) : undefined) ??
      objects.find((o) => norm(o.label) === norm(row.objectLabel));
    if (object && !ids.includes(object.id)) ids.push(object.id);
  }
  return ids;
}
