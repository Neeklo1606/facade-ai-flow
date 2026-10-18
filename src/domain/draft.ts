import type { ExtractionResult, FieldReport, WorkZone } from "@/contracts";

/**
 * Черновик разбора на экране записи (ADR-037, сценарий 1): карточки «Работы, Люди, Материалы,
 * Проблемы, Завтра» и превращение черновика в отчёт и заявку.
 *
 * Здесь нет интерфейса: только правила, по которым значение модели становится записью.
 * Ничего не применяется само — всё это черновик до нажатия «Верно».
 */

export interface DraftField {
  label: string;
  value: string;
  /** Причина янтарной отметки: пусто — значение не вызывает сомнений */
  attention: string | null;
  /** Фраза, из которой взято значение */
  quote: string | null;
}

export interface DraftCard {
  key: "works" | "people" | "materials" | "problems" | "tomorrow";
  title: string;
  /** Пустая карточка не показывается: обещать нечего */
  fields: DraftField[];
}

const fmt = (value: unknown) =>
  value === null || value === undefined ? "не сказано" : String(value);

/** Название вида работ по коду из контекста объекта; код неизвестен — показываем как есть */
export function workTypeName(code: string, known: Map<string, string>) {
  return known.get(code) ?? code.replace(/-/gu, " ");
}

export function draftCards(
  draft: ExtractionResult,
  zones: WorkZone[],
  workTypes: Map<string, string>,
): DraftCard[] {
  const zoneName = (id: string | null) =>
    id ? (zones.find((zone) => zone.id === id)?.name ?? id) : "не сказано";

  const works: DraftField[] = draft.workRecords.flatMap((record, index) => {
    const prefix = draft.workRecords.length > 1 ? `${index + 1}. ` : "";
    return [
      {
        label: `${prefix}Вид работ`,
        value: record.workTypeCode.value
          ? workTypeName(record.workTypeCode.value, workTypes)
          : "не сказано",
        attention: record.workTypeCode.attention,
        quote: record.workTypeCode.provenance?.quote ?? null,
      },
      {
        label: `${prefix}Захватка`,
        value: zoneName(record.zone.value),
        attention: record.zone.attention,
        quote: record.zone.provenance?.quote ?? null,
      },
      {
        label: `${prefix}Объём`,
        value: `${fmt(record.quantity.value)} ${record.unit.value ?? ""}`.trim(),
        attention: record.quantity.attention ?? record.unit.attention,
        quote: record.quantity.provenance?.quote ?? null,
      },
    ];
  });

  const people: DraftField[] = draft.workRecords.flatMap((record, index) => {
    const prefix = draft.workRecords.length > 1 ? `${index + 1}. ` : "";
    return [
      {
        label: `${prefix}Людей`,
        value: fmt(record.people.value),
        attention: record.people.attention,
        quote: record.people.provenance?.quote ?? null,
      },
      {
        label: `${prefix}Часов`,
        value: fmt(record.hours.value),
        attention: record.hours.attention,
        quote: record.hours.provenance?.quote ?? null,
      },
    ];
  });

  const materials: DraftField[] = draft.risks
    .filter((risk) => risk.kind.value === "material_shortage")
    .map((risk) => ({
      label: "Нужен материал",
      value: risk.what.value ?? "не сказано",
      attention: risk.what.attention,
      quote: risk.what.provenance?.quote ?? null,
    }));

  const problems: DraftField[] = [
    ...draft.tasks.map((task) => ({
      label: "Замечание",
      value: task.defect.value ?? "не сказано",
      attention: task.defect.attention ?? task.assignee.attention,
      quote: task.defect.provenance?.quote ?? null,
    })),
    ...draft.risks
      .filter((risk) => risk.kind.value !== "material_shortage")
      .map((risk) => ({
        label: "Проблема",
        value: risk.what.value ?? "не сказано",
        attention: risk.what.attention,
        quote: risk.what.provenance?.quote ?? null,
      })),
  ];

  const tomorrow: DraftField[] = draft.plannedTomorrow.map((text) => ({
    label: "План",
    value: text,
    attention: null,
    quote: null,
  }));

  return (
    [
      { key: "works" as const, title: "Работы", fields: works },
      { key: "people" as const, title: "Люди и часы", fields: people },
      { key: "materials" as const, title: "Материалы", fields: materials },
      { key: "problems" as const, title: "Проблемы", fields: problems },
      { key: "tomorrow" as const, title: "Завтра", fields: tomorrow },
    ] satisfies DraftCard[]
  ).filter((card) => card.fields.length > 0);
}

/** Можно ли завести отчёт из записи: нужны захватка, вид работ, объём и единица */
export function reportableRecords(draft: ExtractionResult) {
  return draft.workRecords.filter(
    (record) =>
      record.zone.value !== null &&
      record.workTypeCode.value !== null &&
      record.quantity.value !== null &&
      record.unit.value !== null,
  );
}

export interface RequestPrefill {
  name: string;
  qty: number | null;
  unit: string | null;
  neededBy: string | null;
  note: string;
}

/**
 * Заготовка заявки на материал из черновика. Количество и единица вынимаются из той же фразы,
 * где они сказаны; чего в тексте нет, человек дозаполняет руками — выдумывать нельзя.
 */
export function requestPrefill(draft: ExtractionResult): RequestPrefill | null {
  const risk = draft.risks.find((item) => item.kind.value === "material_shortage");
  if (!risk) return null;
  const text = risk.what.value ?? "";
  const parsed = /(\d+(?:[.,]\d+)?)\s*(шт|м²|м³|пог\.\s?м|кг|т|л)/iu.exec(text);
  const name = text
    .replace(/^не\s+хватает\s+/iu, "")
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*(шт|м²|м³|пог\.\s?м|кг|т|л).*$/iu, "")
    .trim();
  /*
   * Название приходит из фразы прораба и остаётся в его падеже: справочник номенклатуры
   * прорабу не виден (права на раздел «Справочники» у него нет), а выдумывать название
   * нельзя. Первая буква поднимается, чтобы поле не выглядело обрезанным.
   */
  const named = name || text;
  return {
    name: named.charAt(0).toUpperCase() + named.slice(1),
    qty: parsed ? Number(parsed[1]!.replace(",", ".")) : null,
    unit: parsed ? parsed[2]!.replace(/\s+/gu, " ") : null,
    neededBy: risk.answerBy.value,
    note: risk.decisionNeeded.value ?? text,
  };
}

/** Строка отчёта из записи черновика: то, что уйдёт в reports.create */
export function reportFromRecord(
  record: ExtractionResult["workRecords"][number],
  options: { projectId: string; date: string; summary: string; workTypes: Map<string, string> },
) {
  return {
    projectId: options.projectId,
    zoneId: record.zone.value!,
    workType: workTypeName(record.workTypeCode.value!, options.workTypes),
    declaredQty: record.quantity.value!,
    unit: record.unit.value!,
    reportDate: options.date,
    headcount: record.people.value ?? 0,
    summary: options.summary.slice(0, 600),
  };
}

/** Виды работ объекта по коду: собираются из его отчётов, как и контекст для модели */
export function workTypeMap(reports: FieldReport[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const report of reports) {
    const name = report.workType.trim();
    if (!name) continue;
    const code = name
      .toLowerCase()
      .replace(/ё/gu, "е")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/gu, "");
    map.set(code, name);
  }
  return map;
}
