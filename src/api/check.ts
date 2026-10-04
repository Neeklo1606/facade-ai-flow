import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { zoneLabel } from "@/domain/today";
import { queries } from "./queries";
import { useAccess } from "./access";

/**
 * Данные экрана «Проверка» (ADR-028, п. 3): очередь фактов с площадки и объекты, где ждут
 * проверки позиции спецификации. Экран получает готовые списки.
 *
 * `projectId` — объект из чипа шапки; `null` означает «все мои объекты».
 */
export function useCheckQueue(projectId: string | null) {
  const { can } = useAccess();
  const registry = useQuery(queries.projects());
  const rows = useMemo(() => registry.data ?? [], [registry.data]);
  const ids = useMemo(
    () => rows.map((row) => row.project.id).filter((id) => !projectId || id === projectId),
    [rows, projectId],
  );

  const cards = useQueries({ queries: ids.map((id) => queries.project(id)) });
  const reports = useQueries({ queries: ids.map((id) => queries.reports(id)) });

  const cardsData = cards.map((query) => query.data);
  const reportsData = reports.map((query) => query.data);
  /*
   * Ключи — отметки обновления кеша, а не длины списков. По длине приёмка факта не видна:
   * она меняет статус, а не число записей, и очередь оставалась прежней после решения.
   */
  const zonesKey = cards.map((query) => query.dataUpdatedAt).join("|");
  const reportsKey = reports.map((query) => query.dataUpdatedAt).join("|");

  const queue = useMemo(
    () => {
      const zones = cardsData.flatMap((card) => card?.zones ?? []);
      const names = new Map(rows.map((row) => [row.project.id, row.project.name]));
      return reportsData
        .flatMap((list) => list ?? [])
        .filter((card) => card.report.status === "review")
        .map((card) => ({
          card,
          projectName: names.get(card.report.projectId) ?? "Объект",
          zoneName: zoneLabel(zones.find((item) => item.id === card.report.zoneId)),
        }))
        .sort((a, b) => a.card.report.sentAt.localeCompare(b.card.report.sentAt));
    },
    // Состав описан ключами: ссылки на массивы useQueries меняются каждый рендер
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, zonesKey, reportsKey],
  );

  /** Объекты, где позиции спецификации ждут проверки: вторая вкладка экрана */
  const positions = useMemo(
    () =>
      can("documents")
        ? rows
            .filter((row) => row.overview.specUnverified > 0)
            .filter((row) => !projectId || row.project.id === projectId)
            .map((row) => ({
              projectId: row.project.id,
              projectName: row.project.name,
              unverified: row.overview.specUnverified,
              total: row.overview.specTotal,
            }))
            .sort((a, b) => b.unverified - a.unverified)
        : [],
    [rows, projectId, can],
  );

  return {
    queue,
    positions,
    pending:
      registry.isPending ||
      cards.some((query) => query.isPending) ||
      reports.some((query) => query.isPending),
    error: registry.isError || [...cards, ...reports].some((query) => query.isError),
    refetch: () => {
      void registry.refetch();
      for (const query of [...cards, ...reports]) void query.refetch();
    },
  };
}
