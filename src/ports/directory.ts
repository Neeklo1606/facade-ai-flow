import { z } from "zod";
import { counterparties, employeeView, type Counterparty, type Employee } from "@/contracts";

export const employeeList = z.array(employeeView);
export const counterpartyList = z.array(counterparties);

/** Справочники: сотрудники и контрагенты. Текущий пользователь берётся из сессии. */
export interface DirectoryPort {
  employees(): Promise<Employee[]>;
  counterparties(): Promise<Counterparty[]>;
}
