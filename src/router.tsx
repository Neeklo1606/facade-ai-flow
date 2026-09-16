import { dehydrate, hydrate, QueryClient, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { dataSource } from "@/api/config";
import { subscribeSpecStore } from "@/lib/spec-store";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Демо-адаптер работает без сети: запросы не должны вставать на паузу без соединения
        networkMode: dataSource === "demo" ? "always" : "online",
        retry: dataSource === "demo" ? false : 2,
        staleTime: 0,
      },
      mutations: { networkMode: dataSource === "demo" ? "always" : "online" },
    },
  });

  // Демо: события симулятора (ответы поставщиков, стадии распознавания) меняют данные без запроса
  // пользователя — обновляем открытые запросы. Временный мост до переноса симулятора в адаптер (P2-6).
  if (dataSource === "demo" && typeof window !== "undefined") {
    subscribeSpecStore(() => void queryClient.invalidateQueries());
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Рабочий режим: данные, загруженные на сервере, передаются клиенту вместе с HTML
    // Данные запросов — JSON из схем контрактов, но тип DehydratedState роутер проверить не может
    dehydrate: () => ({ queryClientState: dehydrate(queryClient) as never }),
    hydrate: (dehydrated: { queryClientState: DehydratedState }) => {
      hydrate(queryClient, dehydrated.queryClientState);
    },
  });

  return router;
};
