import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  comingDeliveries,
  returnedReports,
  todayOf,
  todayWorks,
  type TodaySource,
} from "@/domain/today";
import { queries } from "./queries";
import { useNow } from "./clock";

/**
 * Данные экрана «Сегодня» (ADR-028, п. 2): отчёты и поставки объектов, доступных человеку.
 * Экран получает готовые строки, формулы — в домене (ADR-001, п. 5).
 *
 * `projectId` — объект из чипа шапки; `null` означает «все мои объекты».
 */
export function useToday(projectId: string | null) {
  const now = useNow();
  const registry = useQuery(queries.projects());

  const rows = useMemo(() => registry.data ?? [], [registry.data]);
  const ids = useMemo(
    () => rows.map((row) => row.project.id).filter((id) => !projectId || id === projectId),
    [rows, projectId],
  );

  const cards = useQueries({ queries: ids.map((id) => queries.project(id)) });
  const reports = useQueries({ queries: ids.map((id) => queries.reports(id)) });
  const deliveries = useQueries({ queries: ids.map((id) => queries.deliveries(id)) });

  const cardsData = cards.map((query) => query.data);
  const reportsData = reports.map((query) => query.data);
  const deliveriesData = deliveries.map((query) => query.data);

  /*
   * Ключи сохраняют состав данных между рендерами (массивы из useQueries каждый раз новые)
   * и берутся из отметок обновления кеша: по длине списка не видно, что отчёт сменил статус
   */
  const zonesKey = cards.map((query) => query.dataUpdatedAt).join("|");
  const reportsKey = reports.map((query) => query.dataUpdatedAt).join("|");
  const deliveriesKey = deliveries.map((query) => query.dataUpdatedAt).join("|");

  const source: TodaySource = useMemo(
    () => ({
      now,
      projects: rows.map((row) => row.project),
      zones: cardsData.flatMap((card) => card?.zones ?? []),
      reports: reportsData.flatMap((list) => (list ?? []).map((card) => card.report)),
      deliveries: deliveriesData.flatMap((list) => list ?? []),
    }),
    // Состав данных описан ключами выше; ссылки на массивы useQueries меняются каждый рендер
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, rows, zonesKey, reportsKey, deliveriesKey],
  );

  const view = useMemo(
    () => ({
      date: todayOf(source),
      works: todayWorks(source),
      deliveries: comingDeliveries(source),
      returned: returnedReports(source),
    }),
    [source],
  );

  return {
    ...view,
    now,
    projects: rows,
    pending:
      registry.isPending ||
      cards.some((query) => query.isPending) ||
      reports.some((query) => query.isPending) ||
      deliveries.some((query) => query.isPending),
    error: registry.isError || [...cards, ...reports, ...deliveries].some((query) => query.isError),
    refetch: () => {
      void registry.refetch();
      for (const query of [...cards, ...reports, ...deliveries]) void query.refetch();
    },
  };
}
