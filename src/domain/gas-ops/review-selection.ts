import { acceptBlocker, entryInfo, isClean } from "./entry-info";
import type { EntryView } from "./view";

/** Даты записи включительно; фильтры не меняют исходную дату и объект. */
export function filterReviewPeriod(
  rows: EntryView[],
  { objectId = "all", from = "", to = "" }: { objectId?: string; from?: string; to?: string },
): EntryView[] {
  return rows.filter(
    ({ entry }) =>
      (objectId === "all" || entry.objectId === objectId) &&
      (!from || entry.day >= from) &&
      (!to || entry.day <= to),
  );
}

/** Замечания остаются для индивидуальной проверки, уже принятые не выбираются повторно. */
export function canSelectReview(view: EntryView): boolean {
  return view.entry.status === "pending" && view.entry.minutes > 0 && isClean(entryInfo(view));
}

/**
 * Запись можно отметить флажком вручную: ждёт проверки и её можно принять (нет ошибки,
 * которая блокирует принятие). Записи с замечаниями отмечаются тоже, но принимаются пакетом
 * только после явного подтверждения со списком замечаний (обратная связь 20.11.2026)
 */
export function canPickReview(view: EntryView): boolean {
  return (
    view.entry.status === "pending" && view.entry.minutes > 0 && !acceptBlocker(entryInfo(view))
  );
}
