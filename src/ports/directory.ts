import { z } from "zod";
import {
  counterpartyRef,
  employeeRole,
  employeeStatus,
  employeeView,
  type CounterpartyRef,
  type Employee,
} from "@/contracts";
import type { Actor } from "./common";

export const employeeList = z.array(employeeView);
export const counterpartyList = z.array(counterpartyRef);

/**
 * Сотрудник, заведённый руководителем (ADR-021, п. 8). Телефон — ключ входа, поэтому он
 * обязателен и уникален; почта необязательна: у прораба её часто нет.
 */
export const saveEmployeeInput = z.object({
  /** Нет — заводим нового; есть — правим существующего */
  id: z.string().min(1).optional(),
  name: z.string().min(3).max(120),
  position: z.string().min(2).max(120),
  role: employeeRole.schema,
  phone: z.string().min(6).max(32),
  email: z.string().email().max(120).nullable().optional(),
  telegram: z.string().max(64).nullable().optional(),
  status: employeeStatus.schema.optional(),
  /** Объекты сотрудника: для ролей «свои объекты» это и есть граница доступа (ADR-012) */
  projectIds: z.array(z.string().min(1)).max(50),
});

export type SaveEmployeeInput = z.infer<typeof saveEmployeeInput>;

/** Справочники: сотрудники и контрагенты. Текущий пользователь берётся из сессии. */
export interface DirectoryPort {
  employees(): Promise<Employee[]>;
  /** Имя и роль: контакты поставщиков доступны только через раздел «Поставщики» (ADR-012) */
  counterparties(): Promise<CounterpartyRef[]>;
  /** Завести сотрудника или изменить его роль, объекты и контакты */
  saveEmployee(input: SaveEmployeeInput, actor: Actor): Promise<Employee>;
}
