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
import { useAccess } from "./access";
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
  /*
   * «Обзор» — не раздел прав, а сборка блоков, и каждый требует права своего источника
   * (ADR-028). История открыта не всем: снабжению запрос ожиданий решений и ленты вернул бы
   * отказ, поэтому они не отправляются вовсе, а блоки без источника экран не показывает.
   */
  const { can } = useAccess();
  const seesHistory = can("timeline") || can("dashboard");
  const seesDocuments = can("documents");
  const seesProcurement = can("procurement");
  const registry = useQuery(queries.projects());
  const documents = useQuery({ ...queries.documents(), enabled: seesDocuments });

  const projects = useMemo(() => registry.data ?? [], [registry.data]);
  const ids = useMemo(() => projects.map((row) => row.project.id), [projects]);

  const cards = useQueries({ queries: ids.map((id) => queries.project(id)) });
  const requests = useQueries({
    queries: ids.map((id) => ({ ...queries.requests(id), enabled: seesProcurement })),
  });
  const pending = useQueries({
    queries: ids.map((id) => ({ ...queries.pendingDecisions(id), enabled: seesHistory })),
  });
  const timeline = useQueries({
    queries: ids.map((id) => ({ ...queries.timeline(id), enabled: seesHistory })),
  });

  const cardsData = cards.map((query) => query.data);
  const requestsData = requests.map((query) => query.data);
  const pendingData = pending.map((query) => query.data);
  const timelineData = timeline.map((query) => query.data);

  /*
   * Ключи сохраняют состав данных между рендерами (массивы из useQueries каждый раз новые)
   * и берутся из отметок обновления кеша: по длине списка не видно, что позиция проверена
   * или запрос получил ответ, — числа замирали до перезагрузки
   */
  const cardsKey = cards.map((query) => query.dataUpdatedAt).join("|");
  const requestsKey = requests.map((query) => query.dataUpdatedAt).join("|");
  const pendingKey = pending.map((query) => query.dataUpdatedAt).join("|");
  const timelineKey = timeline.map((query) => query.dataUpdatedAt).join("|");

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
    /** Какие источники открыты роли: экран прячет блоки, которых не будет (ADR-028) */
    sources: { history: seesHistory, documents: seesDocuments, procurement: seesProcurement },
    /** Шапка и полоса метрик: ждём реестр, документы и карточки объектов */
    headPending:
      registry.isPending ||
      (seesDocuments && documents.isPending) ||
      cards.some((query) => query.isPending),
    headError: registry.isError || documents.isError,
    /** Колонки: запросы, ожидания решений и лента */
    listsPending:
      !ids.length ||
      (seesProcurement && requests.some((query) => query.isPending)) ||
      (seesHistory &&
        (pending.some((query) => query.isPending) || timeline.some((query) => query.isPending))),
    listsError: [...requests, ...pending, ...timeline].some((query) => query.isError),
    refetch: () => {
      void registry.refetch();
      void documents.refetch();
      for (const query of [...cards, ...requests, ...pending, ...timeline]) void query.refetch();
    },
  };
}
