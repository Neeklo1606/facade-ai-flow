/**
 * Правила меток и подписей записи для экранов проверки и журнала (ADR-044, F5, п. 2–3).
 * Отдельно от компонентов, чтобы метки считались одинаково везде, где их рисуют.
 */
import { FLAG_LABEL, fmtHours, formatClock, type EntryFlag, type EntryView } from "@/api/gas-ops";
import { fmtDate } from "@/lib/format";

/* ---------------------------------------------------------------- Подписи */

const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** «Сб 03.10.2026»: день недели нужен, чтобы сверить запись с нарядом */
export function fmtEntryDay(day: string): string {
  const weekday = WEEKDAY[new Date(`${day}T00:00:00`).getDay()] ?? "";
  return `${weekday} ${fmtDate(day)}`;
}

/** «12:00 – 14:30» или null, если в выгрузке заказчика нет рамки смены */
export function entryFrame(view: EntryView): string | null {
  const { startMinutes, endMinutes } = view.entry;
  return startMinutes !== null && endMinutes !== null
    ? `${formatClock(startMinutes)} – ${formatClock(endMinutes)}`
    : null;
}

/** «Сб 03.10» для узких мест */
export function fmtShortDay(day: string): string {
  const weekday = WEEKDAY[new Date(`${day}T00:00:00`).getDay()] ?? "";
  return `${weekday} ${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

/** «Бригада 1 · 12:00 – 14:30 · 2,50 ч» */
export function entryLine(view: EntryView): string {
  const frame = entryFrame(view);
  return [view.brigade?.name ?? "Бригада не указана", frame, fmtHours(view.hours)]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/* ---------------------------------------------------------------- Признаки */

/** Уровень признака: блокирует, требует решения, информирует */
export type MarkLevel = "block" | "decide" | "info";

export type MarkKey =
  EntryFlag | "zero-minutes" | "late-entry" | "manual-amount" | "needs-agreement";

export interface Mark {
  key: MarkKey;
  label: string;
  level: MarkLevel;
  /** Объяснение для блока «Почему помечено»: что не так и что с этим делать */
  why: string;
}

export const LEVEL_ORDER: Record<MarkLevel, number> = { block: 0, decide: 1, info: 2 };

export const MARK_BASE: Record<MarkKey, { label: string; level: MarkLevel; why: string }> = {
  overlap: {
    label: FLAG_LABEL.overlap,
    level: "block",
    why: "Время пересекается с другой записью этой же бригады в тот же день. Одна из записей неверна.",
  },
  duplicate: {
    label: FLAG_LABEL.duplicate,
    level: "block",
    why: "По этому объекту в этот день у бригады уже есть запись. Проверьте, не внесено ли время дважды.",
  },
  "zero-minutes": {
    label: "Ноль минут",
    level: "block",
    why: "После вычета перерыва времени не осталось. Такая запись не попадёт в выработку.",
  },
  "no-amount": {
    label: FLAG_LABEL["no-amount"],
    level: "decide",
    why: "По записи есть часы, но нет суммы. Доходность не считается, пока сумма не появится.",
  },
  "no-estimate": {
    label: FLAG_LABEL["no-estimate"],
    level: "decide",
    why: "Подтверждённой стоимости работ по объекту нет. Сумму подтверждает менеджер.",
  },
  "high-rate": {
    label: FLAG_LABEL["high-rate"],
    level: "decide",
    why: "Доходность выше 20 000 ₽/ч. В фактическом отчёте такие строки есть: это повод посмотреть, а не ошибка.",
  },
  "late-entry": {
    label: "Вчерашняя запись",
    level: "decide",
    why: "Время внесено на следующий день после работы. Сверьте его с бригадиром.",
  },
  "manual-amount": {
    label: "Введено вручную",
    level: "decide",
    why: "Сумма введена менеджером вручную: у объекта нет сметы.",
  },
  "multi-day-object": {
    label: FLAG_LABEL["multi-day-object"],
    level: "info",
    why: "По объекту работали несколько дней. Правило распределения суммы по дням не согласовано, сумма не распределяется.",
  },
  "needs-agreement": {
    label: "Требует согласования",
    level: "info",
    why: "Стоимость работ по объекту ждёт ручного подтверждения. Правило согласует заказчик.",
  },
};

/** Признаки записи от важного к тихому. Флаги домена плюс то, что видно по самой записи */
export function marksOf(view: EntryView): Mark[] {
  const keys = new Set<MarkKey>(view.flags);
  const { entry } = view;
  if (entry.minutes === 0) keys.add("zero-minutes");
  // Внесено позже дня работы: бригадир вспоминал, а не записывал
  if (entry.createdAt.slice(0, 10) > entry.day) keys.add("late-entry");
  if (view.amountOrigin === "manual") keys.add("manual-amount");
  if (view.estimate?.status === "manual-pending") keys.add("needs-agreement");
  return [...keys]
    .map((key) => ({ key, ...MARK_BASE[key], why: whyOf(key, view) }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/**
 * Объяснение с подробностями записи. Пересечение называет вторую запись той же бригады
 * и минуты (V4, refs/02): без этого его принимали за спор разных бригад на одном объекте.
 */
function whyOf(key: MarkKey, view: EntryView): string {
  if (key === "overlap" && view.overlaps.length) {
    const list = view.overlaps.map((o) => `${o.number} на ${o.minutes} мин`).join(", ");
    const brigade = view.brigade?.name ?? "этой бригады";
    return `Время пересекается с записью ${list}: та же ${brigade}, тот же день. Одна из записей неверна.`;
  }
  if (key === "manual-amount" && view.estimate?.status === "manual-pending") {
    return "Сумма взята из стоимости, которую менеджер ввёл вручную: у объекта нет сметы, и эта стоимость ещё не подтверждена.";
  }
  return MARK_BASE[key].why;
}

/** Запись требует внимания, если есть признак не только информационный */
export function needsAttention(marks: Mark[]): boolean {
  return marks.some((mark) => mark.level !== "info");
}

export const LEVEL_DOT: Record<MarkLevel, string> = {
  block: "bg-danger",
  decide: "bg-warn",
  info: "bg-text-3",
};

export const LEVEL_LABEL: Record<MarkLevel, string> = {
  block: "Блокирует",
  decide: "Требует решения",
  info: "Для сведения",
};

export const FLAG_LEVEL: Record<EntryFlag, MarkLevel> = {
  overlap: "block",
  duplicate: "block",
  "no-amount": "decide",
  "no-estimate": "decide",
  "high-rate": "decide",
  "multi-day-object": "info",
};
