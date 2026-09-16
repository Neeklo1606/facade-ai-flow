import { useMemo } from "react";
import type { ProjectOverview } from "@/contracts";
import { overviewOf, useSpecStore } from "@/lib/spec-store";

/** Сводка объекта по формулам глоссария (§3): считается из позиций, запросов, отчётов. */
export function useProjectOverview(projectId: string): ProjectOverview | null {
  const state = useSpecStore((s) => s);
  return useMemo(() => overviewOf(state, projectId), [state, projectId]);
}

export function useOverviews(projectIds: string[]): (ProjectOverview | null)[] {
  const state = useSpecStore((s) => s);
  const key = projectIds.join(",");
  return useMemo(
    () => projectIds.map((id) => overviewOf(state, id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, key],
  );
}
