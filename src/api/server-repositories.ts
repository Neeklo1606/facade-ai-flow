import { createDemoRepositories } from "@/adapters/demo";
import { guardRepositories, sessionFor } from "@/adapters/access";
import type { Repositories } from "@/ports";
import { sessionActorId } from "./session";

/**
 * Репозитории сервера: серверные функции и серверные маршруты (выгрузки) работают с одним экземпляром.
 * Пока нет PostgreSQL — демо-адаптер в памяти процесса без сохранения.
 */
let repositories: Repositories | null = null;
export const serverRepositories = () =>
  (repositories ??= createDemoRepositories({ persist: false }));

/** Сессия запроса: сотрудник из подписанной cookie, его роль и объекты (ADR-012) */
export async function requestSession() {
  const actorId = await sessionActorId();
  return actorId ? sessionFor(serverRepositories(), actorId) : null;
}

/**
 * Репозитории запроса с проверкой прав: каждая серверная функция и выгрузка ходят только
 * через них. Без сессии любой вызов — 403.
 */
export const requestRepositories = () => guardRepositories(serverRepositories(), requestSession);

/**
 * Сотрудник действия для сигнатуры порта. Настоящего сотрудника подставляет обёртка прав
 * из сессии запроса — переданное здесь значение она отбрасывает.
 */
export const serverActor = () => ({ actorId: "session" });
