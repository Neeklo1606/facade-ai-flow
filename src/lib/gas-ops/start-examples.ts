/**
 * Числа стартового экрана и вкладки «Как считается» (ADR-044, F2). Считаются тем же доменом,
 * что и записи: компоненты формул не знают (P3-1), а пример не расходится с системой.
 */
import { effectiveMinutes, hoursOfMinutes, revenuePerHour } from "@/domain/gas-ops/calc";
import { GAS_SHOW_HINT } from "./show";

/** Запись показа: окно Бригады 1 на сегодня и подтверждённая стоимость ОБ-200 (Демо) */
export const SHOW_AMOUNT_RUB = 14_700;

export function showExample() {
  const result = effectiveMinutes(GAS_SHOW_HINT);
  const minutes = result.ok ? result.minutes : 0;
  return {
    start: GAS_SHOW_HINT.start,
    end: GAS_SHOW_HINT.end,
    minutes,
    hours: hoursOfMinutes(minutes),
    amountRub: SHOW_AMOUNT_RUB,
    rate: revenuePerHour(SHOW_AMOUNT_RUB, minutes),
  };
}

/** Пример из файла заказчика: 395 минут и 44 847 ₽ */
export const CALC_EXAMPLE_MINUTES = 395;
export const CALC_EXAMPLE_AMOUNT_RUB = 44_847;

export function calcExample() {
  const hours = hoursOfMinutes(CALC_EXAMPLE_MINUTES);
  // Часы, как они записаны в файле: два знака
  const shownHours = Math.round(hours * 100) / 100;
  const rate = revenuePerHour(CALC_EXAMPLE_AMOUNT_RUB, CALC_EXAMPLE_MINUTES) ?? 0;
  const naiveRate = Math.round(CALC_EXAMPLE_AMOUNT_RUB / shownHours);
  // Смена из вопроса 9: 08:30–11:40 без перерыва
  const shift = effectiveMinutes({ start: "08:30", end: "11:40", breakMinutes: 0 });
  return {
    minutes: CALC_EXAMPLE_MINUTES,
    amountRub: CALC_EXAMPLE_AMOUNT_RUB,
    hours,
    shownHours,
    /** Сколько минут стоит за округлёнными часами: 6,58 ч это 394,8 мин */
    minutesBehindShown: Math.round(shownHours * 60 * 10) / 10,
    rate,
    naiveRate,
    shiftMinutes: shift.ok ? shift.minutes : null,
  };
}
