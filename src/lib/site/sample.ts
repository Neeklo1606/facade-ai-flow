/**
 * Пример из демо для живых фрагментов лендинга (ADR-050): запись показа ОБ-200 публичного
 * набора. Числа считает domain тем же кодом, что в приложении, на сайте их не пишут руками.
 */
import { effectiveMinutes, fmtHours, fmtRate, fmtRub, revenuePerHour } from "@/domain/gas-ops/calc";
import { PUBLIC_SCENARIO_PLACES } from "@/data/mock/public/places";

const START = "12:00";
const END = "14:30";
/** Подтверждённая стоимость работ ОБ-200 в публичном наборе (сид, `est-m200`) */
const AMOUNT_RUB = 14_700;

const minutes = (() => {
  const result = effectiveMinutes({ start: START, end: END, breakMinutes: 0 });
  return result.ok ? result.minutes : 0;
})();

export const SAMPLE = {
  object: `${PUBLIC_SCENARIO_PLACES.main}, ул. Демо, 200 - котел`,
  code: "ОБ-200",
  number: "ГЗ-00104",
  brigade: "Бригада 1",
  day: "Сб 03.10",
  start: START,
  end: END,
  minutes,
  hours: fmtHours(minutes / 60),
  amount: fmtRub(AMOUNT_RUB),
  rate: fmtRate(revenuePerHour(AMOUNT_RUB, minutes)),
};

/**
 * Ответ «Спросить ГАЙКУ» для окна продукта в первом экране (ADR-052): вопрос про бригаду 1
 * на публичном наборе. Числа записаны константами, чтобы набор данных не ехал в лендинг;
 * тест tests/site/sample.test.ts сверяет их с ответом правила domain.
 */
export const ASK_SAMPLE = {
  question: "Сколько заработала бригада 1 за неделю?",
  title: "Бригада 1",
  lead: "7 подтверждённых записей на 7 объектах. Ещё 1 ждёт проверки.",
  metrics: [
    { label: "Сумма", value: fmtRub(253_800) },
    { label: "Часы", value: fmtHours(31) },
    { label: "Доходность", value: fmtRate(8_187) },
  ],
  rows: [
    { label: "ст. Демо-Озёрное, ул. Демо, 3", value: fmtRub(53_400), source: 2 },
    { label: "ст. Демо-Кленовка, ул. Демо, 2", value: fmtRub(47_300), source: 3 },
  ],
  sources: ["Бригада 1", "ст. Демо-Озёрное, ул. Демо, 3", "ст. Демо-Кленовка, ул. Демо, 2"],
  raw: { amount: 253_800, hours: 31, rate: 8_187, rows: [53_400, 47_300] },
};
