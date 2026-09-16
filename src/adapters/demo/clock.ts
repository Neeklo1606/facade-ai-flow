import { FIXTURES_NOW } from "@/adapters/fixtures";
import { readStorage, removeStorage, writeStorage } from "./storage";

/**
 * Часы демо: идут от «сегодня» фикстур с момента первого действия в сессии.
 * Иначе новые записи получали бы реальную дату и спорили со сроками и историей в фикстурах.
 */

const CLOCK_KEY = "neeklo-fieldops-demo-clock";
let startedAt: number | null = null;

/** Локальное время без часового пояса — в том же формате, что даты в фикстурах */
function localIso(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

const fixturesStart = () => new Date(FIXTURES_NOW).getTime();

/** Время демо для новой записи: первое действие запускает часы */
export function tick() {
  if (startedAt === null) {
    startedAt = Date.now();
    writeStorage(CLOCK_KEY, String(startedAt));
  }
  return localIso(new Date(fixturesStart() + (Date.now() - startedAt)));
}

/** Время демо без запуска часов: до первого действия — «сегодня» фикстур */
export function peek() {
  if (startedAt === null) return FIXTURES_NOW;
  return localIso(new Date(fixturesStart() + (Date.now() - startedAt)));
}

/** Дата демо через `days` дней от момента `from` */
export function addDays(from: string, days: number) {
  return localIso(new Date(new Date(from).getTime() + days * 86_400_000));
}

export function restoreClock() {
  const saved = Number(readStorage(CLOCK_KEY));
  if (saved > 0) startedAt = saved;
}

export function resetClock() {
  startedAt = null;
  removeStorage(CLOCK_KEY);
}
