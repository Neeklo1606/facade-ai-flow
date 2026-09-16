import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";
import { hashKey } from "@tanstack/react-query";
import { dataSource } from "./config";

/** Ключи, загруженные в loader маршрута: только они передаются клиенту вместе с HTML */
const prefetched = new WeakMap<QueryClient, Set<string>>();

export function wasPrefetched(queryClient: QueryClient, queryHash: string) {
  return prefetched.get(queryClient)?.has(queryHash) ?? false;
}

/**
 * Предзагрузка данных в loader маршрута (ADR-002, п. 1).
 * Рабочий режим: на сервере — чтобы SSR отдал готовые данные, на клиенте — при переходе.
 * Демо: маршруты рендерятся на клиенте (ADR-004), на сервере не загружаем.
 */
export async function prefetch<T, K extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<T, Error, T, K>,
) {
  if (dataSource === "demo" && typeof window === "undefined") return undefined;
  const keys = prefetched.get(queryClient) ?? new Set<string>();
  prefetched.set(queryClient, keys);
  keys.add(hashKey(options.queryKey));
  try {
    // Без повторов: переход не должен ждать ретраи, их сделает запрос экрана
    return await queryClient.ensureQueryData({ ...options, retry: false });
  } catch {
    // Ошибку загрузки показывает экран (состояние «Ошибка» с повтором), а не обрыв перехода
    return undefined;
  }
}
