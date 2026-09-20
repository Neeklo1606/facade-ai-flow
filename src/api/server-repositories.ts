import { createDemoRepositories } from "@/adapters/demo";
import {
  createDbRepositories,
  createDriver,
  driverConfigFromEnv,
  fixtureCodec,
  wallClock,
} from "@/adapters/db";
import { guardRepositories, sessionFor } from "@/adapters/access";
import type { Repositories } from "@/ports";
import { sessionActorId } from "./session";

/**
 * Репозитории сервера: серверные функции и серверные маршруты (выгрузки) работают с одним экземпляром.
 * Есть `DATABASE_URL` — адаптер PostgreSQL (ADR-005); нет — демо-адаптер в памяти процесса
 * без сохранения, как в демонстрации.
 */
let repositories: Repositories | null = null;

function createServerRepositories(): Repositories {
  const env = typeof process === "undefined" ? {} : process.env;
  const config = driverConfigFromEnv(env);
  if (!config) return createDemoRepositories({ persist: false });
  return createDbRepositories({
    driver: createDriver(config),
    codec: fixtureCodec(),
    clock: wallClock(env["APP_TIME_ZONE"]?.trim() || "Europe/Moscow"),
  });
}

export const serverRepositories = () => (repositories ??= createServerRepositories());

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
