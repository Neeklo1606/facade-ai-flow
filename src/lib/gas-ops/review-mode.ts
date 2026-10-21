/**
 * Режим проверки (ADR-045, 5.4 и 5.11; разговор с заказчиком 21.10, п. 6): на старте все
 * записи проверяет менеджер, потом автоподтверждение при высокой точности с итоговой
 * проверкой человека перед сдачей отчёта. Только интерфейс раздела «Развитие»: выбор
 * запоминается в браузере и меняет подпись режима, логика проверки не меняется.
 */
import { useSyncExternalStore } from "react";

export type ReviewMode = "all" | "flagged" | "final";

export const REVIEW_MODE_LABEL: Record<ReviewMode, string> = {
  all: "Проверять все",
  flagged: "Проверять только с замечаниями",
  final: "Без проверки, итоговая проверка перед отчётом",
};

/** Подпись строки режима на экране «Проверка» */
export const REVIEW_MODE_LINE: Record<ReviewMode, string> = {
  all: "проверяет менеджер",
  flagged: "менеджер проверяет записи с замечаниями",
  final: "итоговая проверка перед отчётом",
};

const KEY = "neeklo-gas-review-mode";
const listeners = new Set<() => void>();
let mode: ReviewMode | null = null;

function read(): ReviewMode {
  if (mode) return mode;
  mode = "all";
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "flagged" || saved === "final") mode = saved;
  } catch {
    // приватный режим: проверять все
  }
  return mode;
}

export function setReviewMode(next: ReviewMode) {
  mode = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // приватный режим
  }
  for (const listener of listeners) listener();
}

export function useReviewMode(): ReviewMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (typeof window === "undefined" ? "all" : read()),
    () => "all",
  );
}
