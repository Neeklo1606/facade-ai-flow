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
 * Неделя публичного набора «Демо-подрядчик» для первого экрана (ADR-059): подтверждённое
 * начисление по дням и итог минут. Сид в лендинг не грузится (он тяжёлый), поэтому числа
 * записаны здесь, а тест tests/site/landing-sample.test.ts сверяет их с набором.
 */
export const WEEK_SAMPLE = {
  period: "28.09 – 03.10.2026",
  days: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  dates: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"],
  amountRub: [309_100, 232_050, 261_000, 266_500, 394_700, 63_800],
  confirmedMinutes: 21_685,
  confirmedEntries: 93,
};

export const WEEK_TOTAL_RUB = WEEK_SAMPLE.amountRub.reduce((sum, value) => sum + value, 0);
/** Готовые строки показателей: формулы считает domain, компонент их не форматирует */
export const WEEK_TEXT = {
  amount: fmtRub(WEEK_TOTAL_RUB),
  hours: fmtHours(WEEK_SAMPLE.confirmedMinutes / 60),
};

/** Пример акта из демо-набора документов (ADR-058): сверяется тем же тестом */
export const DOCS_SAMPLE = {
  title: "АОСР №\u00a01",
  object: "ОБ-101",
  work: "РО-0001",
  kind: "Прокладка газопровода в футлярах",
  percent: 83,
  missing: "Нет сертификата: Труба стальная ВГП 20 мм",
  owner: "Снабжение",
};

/** Пример заявки снабжения: позиция демо-номенклатуры, статусы пути заявки */
export const SUPPLY_SAMPLE = {
  text: "труба вгп 20 50 метров к пятнице",
  item: "Труба стальная ВГП 20 мм",
  qty: "50\u00a0м",
  limit: "по смете 120\u00a0м, заказано 0, в заявке 50: в пределах сметы",
};
