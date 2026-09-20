import { z } from "zod";
import { counterpartyRef, employeeView, type CounterpartyRef, type Employee } from "@/contracts";

export const employeeList = z.array(employeeView);
export const counterpartyList = z.array(counterpartyRef);

/** Справочники: сотрудники и контрагенты. Текущий пользователь берётся из сессии. */
export interface DirectoryPort {
  employees(): Promise<Employee[]>;
  /** Имя и роль: контакты поставщиков доступны только через раздел «Поставщики» (ADR-012) */
  counterparties(): Promise<CounterpartyRef[]>;
}
