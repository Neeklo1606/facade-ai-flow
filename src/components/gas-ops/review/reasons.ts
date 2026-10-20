/**
 * Частые причины решений проверки (ADR-044, F5, п. 4): кнопками, чтобы не печатать
 * на телефоне. Свой текст всегда можно дописать.
 */
export type ReasonMode = "reject" | "clarify" | "correct";

export const REASONS: Record<ReasonMode, string[]> = {
  reject: [
    "Дубль записи",
    "Работ на объекте не было",
    "Не тот объект",
    "Время не сходится с нарядом",
  ],
  clarify: [
    "Уточните начало и окончание",
    "Уточните объект",
    "Был ли перерыв?",
    "Работы закончены?",
  ],
  correct: [
    "Бригадир ошибся во времени",
    "Перерыв не учтён",
    "Время по наряду",
    "Со слов бригадира",
  ],
};

export const REASON_TITLE: Record<ReasonMode, string> = {
  reject: "Причина отклонения",
  clarify: "Что уточнить у бригадира",
  correct: "Исправление времени",
};

export const REASON_SUBMIT: Record<ReasonMode, string> = {
  reject: "Отклонить запись",
  clarify: "Вернуть бригадиру",
  correct: "Сохранить исправление",
};

/** Причина целиком: выбранная кнопка и свой текст через точку */
export function reasonText(chip: string | null, own: string): string {
  return [chip, own.trim()].filter((part): part is string => !!part).join(". ");
}
