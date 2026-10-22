/**
 * Данные газового заказчика для личного контура (ADR-047). Только сервер: модуль
 * импортирует серверная функция `gasContourFn` по требованию. Клиентский код его не видит,
 * это проверяет `scripts/check-public-bundle.ts`.
 */
import { factReport } from "@/data/mock/fact-report";
import { CUSTOMER_SCENARIO_PLACES } from "@/data/mock/gas-ops-seed";
import {
  GAS_CREDIT,
  GAS_PRODUCT,
  periodLabelOf,
  type GasContourPayload,
} from "@/lib/gas-ops/contour";

export const CUSTOMER_BRAND = {
  client: "ООО «СЛАВЯНСКГАЗСТРОЙ»",
  clientShort: "СЛАВЯНСКГАЗСТРОЙ",
} as const;

export function customerContour(): GasContourPayload {
  return {
    kind: "client",
    brand: {
      ...CUSTOMER_BRAND,
      product: GAS_PRODUCT,
      credit: GAS_CREDIT,
      periodLabel: periodLabelOf(factReport),
    },
    report: factReport,
    places: CUSTOMER_SCENARIO_PLACES,
  };
}
