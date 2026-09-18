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
import { useNow } from "./clock";

/** Ход работ объекта: захватки, контрольные точки и метрики — уже посчитанные (ADR-008) */
export function useWorkProgress(projectId: string) {
  const now = useNow();
  const cardQuery = useQuery(queries.project(projectId));
  const reportsQuery = useQuery(queries.reports(projectId));
  const card = cardQuery.data ?? null;
  const reports = useMemo(
    () => (reportsQuery.data ?? []).map((item) => item.report),
    [reportsQuery.data],
  );

  return useMemo(() => {
    if (!card)
      return {
        pending: cardQuery.isPending || reportsQuery.isPending,
        error: cardQuery.isError || reportsQuery.isError,
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
      pending: cardQuery.isPending || reportsQuery.isPending,
      error: cardQuery.isError || reportsQuery.isError,
      zones,
      timeline,
      metrics: progressMetrics({ zones, timeline, contract: card.contract, now }),
      contract: card.contract,
      refetch: () => {
        void cardQuery.refetch();
        void reportsQuery.refetch();
      },
    };
  }, [card, reports, now, cardQuery, reportsQuery]);
}

/** Команда объекта: люди, бригады и метрики */
export function useTeam(projectId: string) {
  const now = useNow();
  const cardQuery = useQuery(queries.project(projectId));
  const reportsQuery = useQuery(queries.reports(projectId));
  const card = cardQuery.data ?? null;
  const reports = useMemo(
    () => (reportsQuery.data ?? []).map((item) => item.report),
    [reportsQuery.data],
  );

  return useMemo(() => {
    const empty = {
      pending: cardQuery.isPending || reportsQuery.isPending,
      error: cardQuery.isError || reportsQuery.isError,
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
  }, [card, reports, now, cardQuery, reportsQuery]);
}
