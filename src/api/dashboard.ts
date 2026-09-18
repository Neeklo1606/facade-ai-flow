import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  attentionRows,
  dashboardInsight,
  dashboardMetrics,
  liveFeed,
  projectProgress,
  runningProjects,
  unclosedVolume,
  type DashboardPeriod,
  type DashboardSource,
} from "@/domain/dashboard";
import { queries } from "./queries";
import { useNow } from "./clock";

/**
 * Данные дашборда (ADR-007): собираются из существующих запросов и считаются формулами домена.
 * Экран получает готовые числа и не знает ни портов, ни формул (ADR-001, п. 5).
 *
 * Реестр и документы грузит loader маршрута — метрики и главная метрика видны сразу;
 * запросы, ожидания решений и лента по объектам догружаются со скелетонами.
 */
export function useDashboard(period: DashboardPeriod) {
  const now = useNow();
  const registry = useQuery(queries.projects());
  const documents = useQuery(queries.documents());

  const projects = useMemo(() => registry.data ?? [], [registry.data]);
  const ids = useMemo(() => projects.map((row) => row.project.id), [projects]);

  const cards = useQueries({ queries: ids.map((id) => queries.project(id)) });
  const requests = useQueries({ queries: ids.map((id) => queries.requests(id)) });
  const pending = useQueries({ queries: ids.map((id) => queries.pendingDecisions(id)) });
  const timeline = useQueries({ queries: ids.map((id) => queries.timeline(id)) });

  const cardsData = cards.map((query) => query.data);
  const requestsData = requests.map((query) => query.data);
  const pendingData = pending.map((query) => query.data);
  const timelineData = timeline.map((query) => query.data);

  // Ключи сохраняют состав данных между рендерами: массивы из useQueries каждый раз новые
  const cardsKey = cardsData.map((card) => card?.project.id ?? "-").join("|");
  const requestsKey = requestsData.map((rows) => rows?.length ?? -1).join("|");
  const pendingKey = pendingData.map((rows) => rows?.length ?? -1).join("|");
  const timelineKey = timelineData.map((rows) => rows?.length ?? -1).join("|");

  const source: DashboardSource = useMemo(
    () => ({
      now,
      period,
      projects,
      documents: documents.data ?? [],
      cards: cardsData.filter((card): card is NonNullable<typeof card> => !!card),
      requests: requestsData.flatMap((rows) => rows ?? []),
      pending: ids.flatMap((id, index) =>
        (pendingData[index] ?? []).map((row) => ({ ...row, projectId: id })),
      ),
      events: timelineData.flatMap((rows) => rows ?? []),
    }),
    // Состав данных описан ключами выше; ссылки на массивы useQueries меняются каждый рендер
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, period, projects, documents.data, ids, cardsKey, requestsKey, pendingKey, timelineKey],
  );

  const view = useMemo(
    () => ({
      metrics: dashboardMetrics(source),
      volume: unclosedVolume(source),
      attention: attentionRows(source),
      progress: projectProgress(source),
      feed: liveFeed(source),
      insight: dashboardInsight(source),
      running: runningProjects(source.projects).length,
      active: source.projects.filter((row) => row.project.status === "active").length,
      atRisk: source.projects.filter((row) => row.project.status === "at_risk").length,
    }),
    [source],
  );

  return {
    ...view,
    now,
    /** Шапка и полоса метрик: ждём реестр, документы и карточки объектов */
    headPending:
      registry.isPending || documents.isPending || cards.some((query) => query.isPending),
    headError: registry.isError || documents.isError,
    /** Колонки: запросы, ожидания решений и лента */
    listsPending:
      !ids.length ||
      requests.some((query) => query.isPending) ||
      pending.some((query) => query.isPending) ||
      timeline.some((query) => query.isPending),
    listsError: [...requests, ...pending, ...timeline].some((query) => query.isError),
    refetch: () => {
      void registry.refetch();
      void documents.refetch();
      for (const query of [...cards, ...requests, ...pending, ...timeline]) void query.refetch();
    },
  };
}
