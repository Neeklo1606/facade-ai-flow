import { createDemoRepositories } from "@/adapters/demo";
import type { Repositories } from "@/ports";
import { CURRENT_USER_ID } from "./config";

/**
 * Репозитории сервера: серверные функции и серверные маршруты (выгрузки) работают с одним экземпляром.
 * Пока нет PostgreSQL — демо-адаптер в памяти процесса без сохранения.
 */
let repositories: Repositories | null = null;
export const serverRepositories = () =>
  (repositories ??= createDemoRepositories({ persist: false }));

/** Действующий сотрудник берётся на сервере, а не из запроса */
export const serverActor = () => ({ actorId: CURRENT_USER_ID });
