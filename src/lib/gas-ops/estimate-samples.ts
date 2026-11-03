/**
 * Примеры разбора смет заказчика (ADR-045, раздел 1.3 и 5.10). Только числа из таблиц
 * документа владельца от 21.10.2026: реальные файлы смет в репозиторий не кладутся,
 * адреса и реквизиты не указываются. Разбор в демо показывается на этих примерах.
 *
 * Кандидат стоимости работ «всего без НДС минус материалы» — иллюстрация на экране с меткой
 * «Требует согласования», а не правило расчёта: какие строки входят, решает заказчик
 * (открытый вопрос 3 ADR-043). Правило в domain не меняется.
 */

export interface EstimateTotal {
  label: string;
  /** Рубли с копейками; null — строки нет в этом формате */
  value: number;
  unit?: "₽" | "чел.-ч";
}

export interface EstimateSample {
  key: "grand" | "resource";
  format: string;
  /** Откуда файл: расширение и как оформлен */
  file: string;
  vat: string;
  sections: string[];
  totals: EstimateTotal[];
  withoutVat: number;
  materials: number;
  /** Нормативные трудозатраты, если они есть в примере */
  laborHours: number | null;
}

export const ESTIMATE_SAMPLES: Record<EstimateSample["key"], EstimateSample> = {
  grand: {
    key: "grand",
    format: "ГРАНД-Смета, локальный сметный расчёт",
    file: "xlsx, форма по приказу Минстроя № 421/пр",
    vat: "НДС 22%",
    sections: [
      "Раздел 1. Земляные работы",
      "Монтаж подземного полиэтиленового газопровода",
      "Монтаж стальных газопроводов",
      "Испытания газопроводов",
      "Субподрядные работы",
    ],
    totals: [
      { label: "Всего прямые затраты (справочно)", value: 60_000.5 },
      { label: "в том числе материалы", value: 20_000.01 },
      { label: "Всего ФОТ (справочно)", value: 35_000.91 },
      { label: "Всего накладные расходы", value: 38_000.28 },
      { label: "Всего сметная прибыль", value: 22_000.46 },
      { label: "Всего без НДС", value: 120_000.24 },
      { label: "НДС 22%", value: 26_400.05 },
      { label: "ВСЕГО по смете", value: 146_400.29 },
    ],
    withoutVat: 120_000.24,
    materials: 20_000.01,
    laborHours: null,
  },
  resource: {
    key: "resource",
    format: "Ресурсная смета 14 граф",
    file: "xls, оформлена как коммерческое предложение",
    vat: "НДС 5%",
    sections: ["Осн. з/п", "Эксплуатация машин", "З/п механизаторов", "Материалы"],
    totals: [
      { label: "Итого прямые затраты", value: 55_000.56 },
      { label: "Материалы", value: 30_000.25 },
      { label: "ФОТ", value: 16_000.95 },
      { label: "Накладные расходы", value: 16_500.4 },
      { label: "Сметная прибыль", value: 9_500.95 },
      { label: "Итого без НДС", value: 80_000.91 },
      { label: "НДС 5%", value: 4_000.05 },
      { label: "ВСЕГО по смете", value: 84_000.96 },
      { label: "Трудозатраты", value: 40.125, unit: "чел.-ч" },
    ],
    withoutVat: 80_000.91,
    materials: 30_000.25,
    laborHours: 40.125,
  },
};

/** Кандидат «всего без НДС минус материалы», в копейках без ошибок плавающей точки */
export function workCostCandidate(sample: EstimateSample): number {
  return Math.round(sample.withoutVat * 100 - sample.materials * 100) / 100;
}

/** «120 000,24 ₽» */
export function fmtKopecks(value: number): string {
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}
