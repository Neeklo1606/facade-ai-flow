import { useMemo } from "react";
import type { ProjectOverview } from "@/mock/repository";
import { projectSpecStats, useSpecStore, type SpecState } from "@/lib/spec-store";

/** Сводка объекта: базовые показатели плюс живые цифры спецификации и закупки. */
export function overviewFrom(
  s: Pick<SpecState, "positions" | "overviews">,
  projectId: string,
): ProjectOverview | null {
  const base = s.overviews.find((item) => item.projectId === projectId);
  if (!base) return null;
  const stats = projectSpecStats(s as SpecState, projectId);
  return stats ? { ...base, ...stats } : base;
}

export function useProjectOverview(projectId: string) {
  const positions = useSpecStore((s) => s.positions);
  const overviews = useSpecStore((s) => s.overviews);
  return useMemo(
    () => overviewFrom({ positions, overviews }, projectId),
    [positions, overviews, projectId],
  );
}

export function useOverviews(projectIds: string[]) {
  const positions = useSpecStore((s) => s.positions);
  const overviews = useSpecStore((s) => s.overviews);
  const key = projectIds.join(",");
  return useMemo(
    () => projectIds.map((id) => overviewFrom({ positions, overviews }, id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, overviews, key],
  );
}
