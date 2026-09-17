import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ConflictError, NotFoundError } from "@/ports";

/** Ответ порта не совпал со схемой: ошибка сервера, а не запроса */
class ResponseContractError extends Error {
  constructor(readonly issues: ZodError["issues"]) {
    super("Ответ не совпал со схемой контракта");
    this.name = "ResponseContractError";
  }
}

/** Проверка ответа серверной функции схемой контракта */
export function respond<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ResponseContractError(parsed.error.issues);
  return parsed.data;
}

/**
 * Ошибки портов → коды ответа (ADR-001, п. 4). Пользователь видит понятное сообщение,
 * детали схем и стек остаются в журнале сервера.
 */
export const portErrorsMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof NotFoundError) {
        setResponseStatus(404);
        throw new Error(error.message);
      }
      if (error instanceof ConflictError) {
        setResponseStatus(409);
        throw new Error(error.message);
      }
      if (error instanceof ZodError) {
        setResponseStatus(400);
        throw new Error("Неверные данные запроса");
      }
      console.error(error instanceof ResponseContractError ? error.issues : error);
      setResponseStatus(500);
      throw new Error("Внутренняя ошибка сервера. Повторите позже.");
    }
  },
);
