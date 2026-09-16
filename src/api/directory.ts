import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queries } from "./queries";

/**
 * Подписи для экранов: сотрудники, контрагенты, материалы из справочников.
 * Справочники кешируются надолго, поэтому хук дешёвый в любом компоненте.
 */
export function useDirectory() {
  const employees = useQuery(queries.employees()).data;
  const counterparties = useQuery(queries.counterparties()).data;
  const materials = useQuery(queries.materials()).data;

  return useMemo(() => {
    const employeeById = (id: string | null) =>
      id ? (employees?.find((item) => item.id === id) ?? null) : null;
    const counterpartyById = (id: string) => counterparties?.find((item) => item.id === id) ?? null;
    return {
      employees: employees ?? [],
      employeeById,
      /** Имя сотрудника; null — действие записала обработка */
      employeeName: (id: string | null) =>
        id ? (employeeById(id)?.name ?? "—") : "Автоматическая обработка",
      counterpartyById,
      counterpartyName: (id: string) => counterpartyById(id)?.name ?? "—",
      materialById: (id: string | null) =>
        id ? (materials?.find((item) => item.id === id) ?? null) : null,
    };
  }, [employees, counterparties, materials]);
}
