/**
 * Газовый контур без соседних модулей (ADR-061, T0): до сдачи СЛАВЯНСКГАЗСТРОЙ снабжение,
 * ПТО и общий лендинг заморожены. Код и проверки остаются, из навигации контура они уходят.
 * Флаг включён по умолчанию; `VITE_GAS_ONLY=0` в сборке или ключ сессии прогона проверок
 * возвращает модули.
 */
import type { Role } from "@/domain/gas-ops/model";

/** Ключ сессии: "0" показывает снабжение и ПТО, так их проверяют сквозные тесты */
export const GAS_ONLY_KEY = "gaika-gas-only";

export function gasOnlyEnabled() {
  if (import.meta.env["VITE_GAS_ONLY"] === "0") return false;
  try {
    return typeof window === "undefined" || window.sessionStorage.getItem(GAS_ONLY_KEY) !== "0";
  } catch {
    // Приватный режим: ключа нет, действует умолчание
    return true;
  }
}

/** Роли снабжения и ПТО (ADR-057, ADR-058): под флагом их нет в выборе роли */
export const FROZEN_ROLES: readonly Role[] = ["prorab", "supply", "pto"];
