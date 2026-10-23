/**
 * Подписи рабочего контура газового направления (ADR-044, F0; ADR-047). Название подрядчика
 * зависит от контура и берётся хуком `useGasBrand()` из `contour.tsx`: в клиентском коде
 * названия заказчика нет. Здесь только название продукта.
 */
import { GAS_PRODUCT } from "./contour";

/** Заголовок вкладки браузера: экран, продукт */
export function gasTitle(screen: string): string {
  return `${screen} · ${GAS_PRODUCT}`;
}
