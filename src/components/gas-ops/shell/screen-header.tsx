/**
 * Места экрана в шапке оболочки (ADR-061, 3.1): справа от заголовка период и одна главная
 * кнопка, под заголовком строка счётчиков. Экран рисует их у себя, оболочка показывает в шапке.
 * Пока экран не задал счётчики, в строке период и очередь проверки.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Места в шапке экрана: их рисует оболочка (GasShell), заполняет экран */
export const SCREEN_ACTIONS_ID = "gas-screen-actions";
export const SCREEN_COUNTERS_ID = "gas-screen-counters";

function useSlot(id: string) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  // Место появляется вместе с шапкой оболочки: ищем его после монтирования
  useEffect(() => setTarget(document.getElementById(id)), [id]);
  return target;
}

/** Период и главная кнопка экрана справа от заголовка */
export function ScreenActions({ children }: { children: ReactNode }) {
  const target = useSlot(SCREEN_ACTIONS_ID);
  return target ? createPortal(children, target) : null;
}

/** Строка счётчиков экрана: «7 новых · 2 с подозрением · 1 на уточнении» */
export function ScreenCounters({ children }: { children: ReactNode }) {
  const target = useSlot(SCREEN_COUNTERS_ID);
  return target ? createPortal(children, target) : null;
}
