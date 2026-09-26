import {
  MutationCache,
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
  QueryClient,
  type DehydratedState,
} from "@tanstack/react-query";
import { wasPrefetched } from "@/api/prefetch";
import { createRouter } from "@tanstack/react-router";
import { dataSource } from "@/api/config";
import { routeTree } from "./routeTree.gen";
import { actionLabels, recordAction, recordError } from "@/lib/guide/telemetry";
import { toast } from "@/lib/toast";

/**
 * Главные действия сессии — мутации с подписью `meta.action` (ADR-010): телеметрия пишет их,
 * проводка засчитывает по ним шаги. Кеш мутаций общий, поэтому подпись ставится один раз
 * в src/api/mutations.ts, а не в каждом экране.
 */
function actionOf(meta: Record<string, unknown> | undefined) {
  return typeof meta?.["action"] === "string" ? meta["action"] : null;
}

/**
 * Отказы, у которых нет «своего» текста на экране: сбой сервера (500), неверный запрос (400)
 * и обрыв связи. Тексты 500 и 400 задаёт `src/api/errors.ts`, сетевые — браузер.
 */
const UNEXPECTED = [
  /Внутренняя ошибка сервера/i,
  /Неверные данные запроса/i,
  /failed to fetch|networkerror|load failed|network request failed/i,
];

export const getRouter = () => {
  const queryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        const action = actionOf(mutation.options.meta);
        if (action) recordAction(action);
      },
      onError: (error, _variables, _context, mutation) => {
        const action = actionOf(mutation.options.meta);
        const label = action ? (actionLabels[action] ?? action) : "Действие";
        recordError(`${label}: ${error.message}`);
        /*
         * Неожиданный отказ обязан быть виден человеку, а не только в журнале. Отказы по
         * существу (конфликт, нет прав, не найдено) объясняет место вызова своим текстом —
         * их здесь не дублируем. Сбой сервера, обрыв сети и неверный запрос места вызова
         * не имеют: до этой правки кнопка просто не срабатывала молча (аудит перед выпуском).
         */
        if (UNEXPECTED.some((pattern) => pattern.test(error.message))) {
          toast.error(`${label}: не получилось`, {
            description: `${error.message} Если повторяется — скажите внедренцу, что было на экране.`,
          });
        }
      },
    }),
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

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Рабочий режим: данные, загруженные на сервере, передаются клиенту вместе с HTML
    // Данные запросов — JSON из схем контрактов, но тип DehydratedState роутер проверить не может
    // Передаём только данные из loader: запросы, начатые при рендере на сервере, могли завершиться
    // после рендера — клиент получил бы данные, которых нет в HTML, и гидратация разошлась бы
    dehydrate: () => ({
      queryClientState: dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) && wasPrefetched(queryClient, query.queryHash),
      }) as never,
    }),
    hydrate: (dehydrated: { queryClientState: DehydratedState }) => {
      hydrate(queryClient, dehydrated.queryClientState);
    },
  });

  return router;
};
