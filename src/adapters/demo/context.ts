import { setClockSource, type ClockSource } from "./clock";
import { setIdFactory } from "./records";
import { getState, replaceState, type DemoState } from "./state";

/** Окружение одного вызова: состояние, часы и фабрика ключей */
export interface DemoContext {
  state: DemoState;
  clock: ClockSource;
  newId: (prefix: string) => string;
}

/**
 * Выполнить вызов демо-адаптера на чужом состоянии — мост адаптера БД (ADR-005, п. 5).
 * Методы демо считают результат синхронно, поэтому подмена держится только на время вызова
 * и не задевает другие запросы: между подменой и возвратом нет ни одного `await`.
 */
export function runWithin<T>(context: DemoContext, fn: () => T): { result: T; state: DemoState } {
  const prevState = replaceState(context.state);
  const prevClock = setClockSource(context.clock);
  const prevIds = setIdFactory(context.newId);
  try {
    const result = fn();
    return { result, state: getState() };
  } finally {
    replaceState(prevState);
    setClockSource(prevClock);
    setIdFactory(prevIds);
  }
}
