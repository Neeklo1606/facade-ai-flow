import { z } from "zod";
import {
  counterparties,
  counterpartyRole,
  employeeView,
  type Counterparty,
  type Employee,
} from "@/contracts";

export const listEmployeesInput = z.object({
  projectId: z.string().optional(),
  roles: z.array(z.string()).optional(),
});

export const listCounterpartiesInput = z.object({ role: counterpartyRole.schema.optional() });

export const employeeList = z.array(employeeView);
export const counterpartyList = z.array(counterparties);

export type ListEmployeesInput = z.infer<typeof listEmployeesInput>;
export type ListCounterpartiesInput = z.infer<typeof listCounterpartiesInput>;

/** Справочники: сотрудники и контрагенты. Текущий пользователь берётся из сессии. */
export interface DirectoryPort {
  employees(input: ListEmployeesInput): Promise<Employee[]>;
  employee(id: string): Promise<Employee | null>;
  counterparties(input: ListCounterpartiesInput): Promise<Counterparty[]>;
}
