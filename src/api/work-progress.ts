import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  milestoneTimeline,
  progressMetrics,
  teamMetrics,
  teamRows,
  zoneRows,
  silentCrews,
} from "@/domain/work-progress";
import { queries } from "./queries";
import { useAccess } from "./access";
import { useNow } from "./clock";

/**
 * Вид работ, последний факт по захватке и «бригады без отчёта» считаются по отчётам с площадки.
 * Роли без этого раздела их не получают (ADR-012), поэтому такие значения не показываются вовсе:
 * посчитанные по пустому списку, они врали бы — «бригад без отчёта: 2» при пяти отчётах
 */

/** Ход работ объекта: захватки, контрольные точки и метрики — уже посчитанные (ADR-008) */
export function useWorkProgress(projectId: string) {
  const now = useNow();
  const { can } = useAccess();
  const reportsKnown = can("field-reports");
  const cardQuery = useQuery(queries.project(projectId));
  const reportsQuery = useQuery({ ...queries.reports(projectId), enabled: reportsKnown });
  const card = cardQuery.data ?? null;
  const reports = useMemo(
    () => (reportsQuery.data ?? []).map((item) => item.report),
    [reportsQuery.data],
  );

  return useMemo(() => {
    if (!card)
      return {
        pending: cardQuery.isPending || (reportsKnown && reportsQuery.isPending),
        error: cardQuery.isError || (reportsKnown && reportsQuery.isError),
        reportsKnown,
        zones: [],
        timeline: { points: [], todayOffset: null, from: "", to: "" },
        metrics: [],
        contract: null,
        refetch: () => {
          void cardQuery.refetch();
          void reportsQuery.refetch();
        },
      };
    const zones = zoneRows(card.zones, reports, card.project, now);
    const timeline = milestoneTimeline(card.milestones, card.project, now);
    return {
      pending: cardQuery.isPending || (reportsKnown && reportsQuery.isPending),
      error: cardQuery.isError || (reportsKnown && reportsQuery.isError),
      reportsKnown,
      zones,
      timeline,
      metrics: progressMetrics({ zones, timeline, contract: card.contract, now }),
      contract: card.contract,
      refetch: () => {
        void cardQuery.refetch();
        void reportsQuery.refetch();
      },
    };
  }, [card, reports, now, reportsKnown, cardQuery, reportsQuery]);
}

/** Команда объекта: люди, бригады и метрики */
export function useTeam(projectId: string) {
  const now = useNow();
  const { can } = useAccess();
  const reportsKnown = can("field-reports");
  const cardQuery = useQuery(queries.project(projectId));
  const reportsQuery = useQuery({ ...queries.reports(projectId), enabled: reportsKnown });
  const card = cardQuery.data ?? null;
  const reports = useMemo(
    () => (reportsQuery.data ?? []).map((item) => item.report),
    [reportsQuery.data],
  );

  return useMemo(() => {
    const empty = {
      pending: cardQuery.isPending || (reportsKnown && reportsQuery.isPending),
      error: cardQuery.isError || (reportsKnown && reportsQuery.isError),
      reportsKnown,
      people: [],
      crews: [],
      metrics: [],
      silent: [],
      refetch: () => {
        void cardQuery.refetch();
        void reportsQuery.refetch();
      },
    };
    if (!card) return empty;
    const rows = teamRows({
      people: card.team,
      crews: card.crews,
      reports,
      zones: card.zones,
    });
    return {
      ...empty,
      people: rows.people,
      crews: rows.crews,
      metrics: teamMetrics({ people: rows.people, crews: rows.crews, now }),
      silent: silentCrews(rows.crews, now),
    };
  }, [card, reports, now, reportsKnown, cardQuery, reportsQuery]);
}
