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
import type { ReportsGap } from "@/lib/reports-gap";

/**
 * Значения, которые считаются по отчётам с площадки, показываются, только когда отчёты на руках.
 * Почему и как о пропуске говорит экран — `src/lib/reports-gap.ts`
 */

/** Есть ли на руках отчёты объекта: раздел открыт роли (ADR-012) и они получены */
function useReports(projectId: string) {
  const allowed = useAccess().can("field-reports");
  const query = useQuery({ ...queries.reports(projectId), enabled: allowed });
  // Упавшее обновление при живом кэше — не пропуск: отчёты на руках, и экран их показывает
  const gap: ReportsGap | null = !allowed
    ? "closed"
    : query.isError && query.data === undefined
      ? "failed"
      : null;
  const reports = useMemo(() => (query.data ?? []).map((item) => item.report), [query.data]);
  return { gap, reports, pending: allowed && query.isPending };
}

/** Ход работ объекта: захватки, контрольные точки и метрики — уже посчитанные (ADR-008) */
export function useWorkProgress(projectId: string) {
  const now = useNow();
  const cardQuery = useQuery(queries.project(projectId));
  const { gap: reportsGap, reports, pending: reportsPending } = useReports(projectId);
  const card = cardQuery.data ?? null;

  return useMemo(() => {
    if (!card)
      return {
        pending: cardQuery.isPending || reportsPending,
        reportsGap,
        zones: [],
        timeline: { points: [], todayOffset: null, from: "", to: "" },
        metrics: [],
        contract: null,
      };
    const zones = zoneRows(card.zones, reports, card.project, now);
    const timeline = milestoneTimeline(card.milestones, card.project, now);
    return {
      pending: cardQuery.isPending || reportsPending,
      reportsGap,
      zones,
      timeline,
      metrics: progressMetrics({ zones, timeline, contract: card.contract, now }),
      contract: card.contract,
    };
  }, [card, reports, now, reportsGap, reportsPending, cardQuery]);
}

/** Команда объекта: люди, бригады и метрики */
export function useTeam(projectId: string) {
  const now = useNow();
  const cardQuery = useQuery(queries.project(projectId));
  const { gap: reportsGap, reports, pending: reportsPending } = useReports(projectId);
  const card = cardQuery.data ?? null;

  return useMemo(() => {
    const empty = {
      pending: cardQuery.isPending || reportsPending,
      reportsGap,
      people: [],
      crews: [],
      metrics: [],
      silent: [],
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
  }, [card, reports, now, reportsGap, reportsPending, cardQuery]);
}
