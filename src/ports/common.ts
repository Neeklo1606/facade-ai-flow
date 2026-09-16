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

/** Ошибки портов, которые серверная функция превращает в ответ 404, 409, 422 */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} не найден`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
