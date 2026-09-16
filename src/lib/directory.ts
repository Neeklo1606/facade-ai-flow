import { getSpecState } from "@/lib/spec-store";

/**
 * Справочники для подписей на экранах: сотрудники, контрагенты, материалы.
 * Читают текущее состояние демо; в фазе 2 заменяются запросами справочников.
 */

export function employeeById(id: string | null) {
  return id ? (getSpecState().employees.find((item) => item.id === id) ?? null) : null;
}

/** Имя сотрудника; null — действие записала обработка */
export function employeeName(id: string | null) {
  if (!id) return "Автоматическая обработка";
  return employeeById(id)?.name ?? "—";
}

export function counterpartyById(id: string) {
  return getSpecState().counterparties.find((item) => item.id === id) ?? null;
}

export function counterpartyName(id: string) {
  return counterpartyById(id)?.name ?? "—";
}

export function materialById(id: string | null) {
  return id ? (getSpecState().materials.find((item) => item.id === id) ?? null) : null;
}
