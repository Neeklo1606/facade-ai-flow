/**
 * Состав на неделю (ADR-045, 5.8; разговор с заказчиком 21.10, п. 7): отметка бригады
 * «работает» или «в отпуске». Демо-состояние раздела «Развитие»: живёт в браузере,
 * в расчёт выработки не входит. Хранилище может быть недоступно.
 */
import { useSyncExternalStore } from "react";

const KEY = "neeklo-gas-week-crew";
const listeners = new Set<() => void>();
let away: Set<string> | null = null;

function read(): Set<string> {
  if (away) return away;
  away = new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) for (const id of JSON.parse(raw) as string[]) away.add(id);
  } catch {
    // приватный режим: все бригады работают
  }
  return away;
}

export function setOnVacation(brigadeId: string, vacation: boolean) {
  const next = new Set(read());
  if (vacation) next.add(brigadeId);
  else next.delete(brigadeId);
  away = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // приватный режим
  }
  for (const listener of listeners) listener();
}

const EMPTY = new Set<string>();

export function useOnVacation(): Set<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (typeof window === "undefined" ? EMPTY : read()),
    () => EMPTY,
  );
}
