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
