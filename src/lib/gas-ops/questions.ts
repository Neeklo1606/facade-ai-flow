/**
 * Вопросы к согласованию (ADR-044, F7). Десять открытых вопросов из утреннего отчёта
 * (docs/claude/MORNING_REPORT.md, раздел 6) в порядке важности для расчёта: сначала то,
 * что меняет сумму и доходность, потом правила ввода. Пример у каждого вопроса взят
 * из отчёта заказчика за 28.09–03.10.2026; там, где пример из показа, он помечен «Демо».
 *
 * Сами вопросы с примерами из отчёта заказчика лежат на сервере (`src/server/customer-questions.ts`)
 * и приходят только в личном контуре (ADR-047).
 *
 * Ответы заказчика хранятся только в этом браузере: это рабочий лист встречи, а не данные системы.
 */

export interface GasQuestion {
  /** Номер в порядке важности: он же якорь `#q-<n>` */
  n: number;
  /** Номер в утреннем отчёте: по нему вопрос находится в документах */
  reportNo: number;
  question: string;
  example: string;
  impact: string;
  screen: {
    to: "/gas/reports" | "/gas/foreman" | "/gas/moderation" | "/gas/estimates";
    label: string;
  };
}

/** Ссылка на вопрос: метки «Требует согласования» ведут сюда */
export function questionHref(n: number): string {
  return `/gas/questions#q-${n}`;
}

export type QuestionStatus = "open" | "answered";

export interface QuestionAnswer {
  answer: string;
  status: QuestionStatus;
}

export const QUESTIONS_STORAGE_KEY = "neeklo-gas-questions";

export function readAnswers(): Record<number, QuestionAnswer> {
  try {
    const raw = window.localStorage.getItem(QUESTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<number, QuestionAnswer>) : {};
  } catch {
    return {};
  }
}

export function writeAnswers(answers: Record<number, QuestionAnswer>): boolean {
  try {
    window.localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(answers));
    return true;
  } catch {
    // Приватный режим или запрет хранилища: ответ живёт до перезагрузки
    return false;
  }
}

/** Список текстом для мессенджера: номер, вопрос, пример, ответ, если он есть */
export function questionsText(
  questions: readonly GasQuestion[],
  answers: Record<number, QuestionAnswer>,
): string {
  const lines = questions.map((q) => {
    const a = answers[q.n];
    const status = a?.status === "answered" ? "Ответ получен" : "Открыт";
    const answer = a?.answer.trim() ? `\n   Ответ: ${a.answer.trim()}` : "";
    return `${q.n}. ${q.question}\n   Пример: ${q.example}\n   Статус: ${status}${answer}`;
  });
  return `Вопросы к согласованию: учёт выработки бригад\n\n${lines.join("\n\n")}`;
}
