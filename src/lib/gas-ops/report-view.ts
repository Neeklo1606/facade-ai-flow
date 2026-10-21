/**
 * Вид отчёта, который выбирает человек (ADR-045, 5.7; разговор с заказчиком 21.10, п. 5):
 * порядок показателей «сначала деньги» или «сначала время». Только отображение, расчёт
 * не меняется. Выбор запоминается в браузере; хранилище может быть недоступно.
 */
import { useSyncExternalStore } from "react";

export type MetricOrder = "money" | "time";

const KEY = "neeklo-gas-metric-order";
const listeners = new Set<() => void>();
let order: MetricOrder = "money";
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    if (window.localStorage.getItem(KEY) === "time") order = "time";
  } catch {
    // приватный режим: порядок по умолчанию
  }
}

export function setMetricOrder(next: MetricOrder) {
  order = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // приватный режим: выбор живёт до перезагрузки
  }
  for (const listener of listeners) listener();
}

export function useMetricOrder(): MetricOrder {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => {
      load();
      return order;
    },
    () => "money",
  );
}
