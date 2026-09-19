import { z } from "zod";
import { idSchema } from "@/contracts";

/**
 * Общие схемы портов. Порт — интерфейс доступа к данным одной области: методы чтения и мутаций,
 * вход и выход описаны схемами. Реализации — адаптеры (`adapters/fixtures`, позже `adapters/db`),
 * вызываются из серверных функций (P2-1). Экраны порты не импортируют.
 */

/** Кто выполняет действие. Приходит из сессии в серверной функции, а не из формы. */
export const actorInput = z.object({ actorId: idSchema });

export const pageInput = z.object({
  cursor: z.string().nullable().default(null),
  // До серверного пейджинга (P3-3) список позиций ревизии отдаётся целиком
  limit: z.number().int().min(1).max(5000).default(100),
});

export function pageOf<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    /** null — страниц больше нет */
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  });
}

export type Actor = z.infer<typeof actorInput>;
export type PageInput = z.input<typeof pageInput>;
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

/** Ошибки портов, которые серверная функция превращает в ответ 403, 404, 409 */
export class NotFoundError extends Error {
  readonly id: string;

  constructor(entity: string, id: string) {
    // id в сообщение не кладём: текст уходит пользователю
    super(`Не найдено: ${entity.toLowerCase()}`);
    this.id = id;
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Текст отказа в правах: один на все отказы — раздел, метод и роль в ответ не попадают (ADR-012) */
export const FORBIDDEN_MESSAGE = "Недостаточно прав для этого действия";

export class ForbiddenError extends Error {
  /** Что именно запрещено — только для журнала сервера */
  readonly detail: string;

  constructor(detail: string) {
    super(FORBIDDEN_MESSAGE);
    this.detail = detail;
    this.name = "ForbiddenError";
  }
}
