/**
 * Вопросы к согласованию (ADR-044, F7). Десять открытых вопросов из утреннего отчёта
 * (docs/claude/MORNING_REPORT.md, раздел 6) в порядке важности для расчёта: сначала то,
 * что меняет сумму и доходность, потом правила ввода. Пример у каждого вопроса взят
 * из отчёта заказчика за 28.09–03.10.2026; там, где пример из показа, он помечен «Демо».
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

export const GAS_QUESTIONS: readonly GasQuestion[] = [
  {
    n: 1,
    reportNo: 1,
    question: "Как делить стоимость объекта, если на нём работали несколько дней или бригад?",
    example:
      "В файле один адрес идёт пять дней подряд по 13 000 ₽ и 8 ч в день. Это похоже на дневную ставку, а не на сумму по смете.",
    impact: "Сумма каждой строки отчёта и доходность часа по дням и бригадам.",
    screen: { to: "/gas/reports", label: "Отчёт" },
  },
  {
    n: 2,
    reportNo: 2,
    question: "Что считать суммой начисления, пока объект не завершён?",
    example:
      "Девять строк с часами и без суммы: вводы, КНС, замена счётчика, устранение утечки. Сейчас у них «нет суммы» и доходность не считается.",
    impact: "Попадут ли эти часы в доходность недели и как выглядит строка в отчёте.",
    screen: { to: "/gas/reports", label: "Отчёт" },
  },
  {
    n: 3,
    reportNo: 6,
    question: "Как ставится обед: по дню вручную или одним правилом?",
    example:
      "Подпись «36 час 50 мин» в строке смены равна сумме рамок минус обед. В четырёх днях из семи обед ровно 60 минут, в остальных 72, 72 и 58.",
    impact: "Эффективные минуты каждой записи, а от них часы и доходность.",
    screen: { to: "/gas/foreman", label: "Бот бригадира" },
  },
  {
    n: 4,
    reportNo: 7,
    question: "Как округлять половину рубля в доходности?",
    example:
      "14 700 ₽ за 2,67 ч дают 5 512,5 ₽/ч. В файле 5 512, арифметическое округление даёт 5 513. Так расходятся две строки из 84.",
    impact: "Доходность в отчёте и в выгрузке Excel до рубля.",
    screen: { to: "/gas/reports", label: "Отчёт" },
  },
  {
    n: 5,
    reportNo: 9,
    question: "Смена 08:30–11:40 это 185 или 190 минут?",
    example:
      "По часам выходит 190 минут, и система считает 190. Если 5 минут уходят на что-то по правилу, его нужно назвать.",
    impact: "Минуты смены и все суммы, которые от них считаются.",
    screen: { to: "/gas/foreman", label: "Бот бригадира" },
  },
  {
    n: 6,
    reportNo: 10,
    question: "Строки бригад 3 и 5 повторяются: это перенос блока или две разные работы?",
    example:
      "Четыре адресные строки совпадают до рубля и до часа, строка смены бригады 5 дословно повторяет бригаду 3. Если это перенос, неделя завышена на 29 300 ₽.",
    impact: "Сумма недели по бригадам и метка «Возможный дубль» в проверке.",
    screen: { to: "/gas/moderation", label: "Проверка" },
  },
  {
    n: 7,
    reportNo: 8,
    question: "Откуда в строке «Итого» 5 165 357 ₽?",
    example:
      "Видимые строки дают 1 524 132 ₽ и 361,35 ч, «Итого» 5 165 357 ₽ и 776,08 ч. Групп 2 и 4 в выгрузке нет, похоже на фильтр по подразделениям.",
    impact: "С чем сверять итог недели: система считает снизу вверх по видимым строкам.",
    screen: { to: "/gas/reports", label: "Отчёт" },
  },
  {
    n: 8,
    reportNo: 3,
    question: "Какие статьи сметы входят в стоимость работ?",
    example:
      "Демо: у объекта ОБ-200 стоимость 14 700 ₽ одной суммой из итога сметчика, без разбивки на работы, материалы и выезд.",
    impact: "Подтверждённая стоимость объекта, от неё сумма и доходность.",
    screen: { to: "/gas/estimates", label: "Стоимость работ" },
  },
  {
    n: 9,
    reportNo: 4,
    question: "Кто утверждает сумму по котлам, у которых нет сметы?",
    example:
      "По котлам без сметы сумму сейчас вносит менеджер вручную с комментарием. Нужно назвать, кто её подтверждает.",
    impact: "Право ввода суммы и источник суммы в карточке записи.",
    screen: { to: "/gas/estimates", label: "Стоимость работ" },
  },
  {
    n: 10,
    reportNo: 5,
    question: "Можно ли вносить и исправлять время за вчера и до какого часа?",
    example:
      "Отчёт за 28.09–03.10.2026 собран в конце недели. В боте бригадир выбирает день записи, правило срока пока не задано.",
    impact: "Какие дни бот предлагает бригадиру и когда запись закрывается для правки.",
    screen: { to: "/gas/foreman", label: "Бот бригадира" },
  },
];

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
export function questionsText(answers: Record<number, QuestionAnswer>): string {
  const lines = GAS_QUESTIONS.map((q) => {
    const a = answers[q.n];
    const status = a?.status === "answered" ? "Ответ получен" : "Открыт";
    const answer = a?.answer.trim() ? `\n   Ответ: ${a.answer.trim()}` : "";
    return `${q.n}. ${q.question}\n   Пример: ${q.example}\n   Статус: ${status}${answer}`;
  });
  return `Вопросы к согласованию: учёт выработки бригад\n\n${lines.join("\n\n")}`;
}
