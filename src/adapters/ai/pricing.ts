/**
 * Прайс провайдеров для оценки стоимости обращения (ADR-035, п. 3). Копейки за миллион
 * токенов, по публичным ценам на 18.10.2026. Модели, цены которой здесь нет, стоимость
 * не выдумывается: в журнал идёт null — неизвестное остаётся неизвестным (правило 3).
 *
 * Цены меняются. Это оценка для сравнения прогонов, а не счёт: точную сумму даёт провайдер.
 */
export interface ModelPrice {
  /** Копейки за миллион токенов запроса */
  inPerMillion: number;
  /** Копейки за миллион токенов ответа */
  outPerMillion: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "deepseek:deepseek-chat": { inPerMillion: 2700, outPerMillion: 10900 },
  "deepseek:deepseek-reasoner": { inPerMillion: 5500, outPerMillion: 21800 },
  "openai:gpt-4o-mini": { inPerMillion: 1400, outPerMillion: 5500 },
  "openai:gpt-4o": { inPerMillion: 23000, outPerMillion: 91000 },
};

/** Оценка стоимости в копейках; null — цены этой модели нет в прайсе */
export function estimateCost(
  provider: string,
  model: string,
  tokensIn: number | null,
  tokensOut: number | null,
): number | null {
  const price = PRICES[`${provider}:${model}`];
  if (!price || tokensIn === null || tokensOut === null) return null;
  const kopecks =
    (tokensIn * price.inPerMillion) / 1_000_000 + (tokensOut * price.outPerMillion) / 1_000_000;
  return Math.round(kopecks);
}
