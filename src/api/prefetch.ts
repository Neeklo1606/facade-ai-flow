import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";
import { dataSource } from "./config";

/**
 * Предзагрузка данных в loader маршрута (ADR-002, п. 1).
 * Рабочий режим: на сервере — чтобы SSR отдал готовые данные, на клиенте — при переходе.
 * Демо: данные живут во вкладке, сервер их не видит — на сервере не загружаем, экран покажет скелетон
 * до гидратации, а не устаревшие стартовые цифры.
 */
export async function prefetch<T, K extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<T, Error, T, K>,
) {
  if (dataSource === "demo" && typeof window === "undefined") return undefined;
  return queryClient.ensureQueryData(options);
}
