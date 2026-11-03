import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { input } from "./errors";
import { answerGasCall } from "./gas-ops-server";
import { gasServerStore } from "./gas-server-store";
import { sessionActorId } from "./session";

/**
 * Серверная функция учёта времени (ADR-061, 14): один вход на все методы порта. Кто
 * действует — из сессии; роль, аргументы и выборка ответа — в `answerGasCall`.
 *
 * Пользователь `gas_users` пока совпадает с сотрудником сессии по ключу: связать вход
 * по коду с ролями учёта времени — задача 2 раздела 9.5 docs/BACKEND_HANDOFF.md.
 */
export const gasOpsCallFn = createServerFn({ method: "POST" })
  .validator(input(z.object({ method: z.string().min(1), args: z.array(z.unknown()).max(2) })))
  /*
   * Отказ приходит телом с кодом, а не статусом HTTP: экран показывает текст правила порта.
   * Ответ строкой JSON: снимок и записи — простые данные, тип ответа у методов разный
   */
  .handler(async ({ data }): Promise<string> =>
    JSON.stringify(await answerGasCall(data, await sessionActorId(), await gasServerStore())),
  );
