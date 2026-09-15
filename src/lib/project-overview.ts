import { useMemo } from "react";
import { overviewOf, type ProjectOverview } from "@/mock/repository";
import { projectSpecStats, useSpecStore, type SpecState } from "@/lib/spec-store";

/** Сводка объекта: статичные показатели плюс живые цифры спецификации и закупки. */
export function overviewFrom(s: SpecState, projectId: string): ProjectOverview | null {
  const base = overviewOf(projectId);
  if (!base) return null;
  const stats = projectSpecStats(s, projectId);
  return stats ? { ...base, ...stats } : base;
}

export function useProjectOverview(projectId: string) {
  const positions = useSpecStore((s) => s.positions);
  return useMemo(() => overviewFrom({ positions } as SpecState, projectId), [positions, projectId]);
}

export function useOverviews(projectIds: string[]) {
  const positions = useSpecStore((s) => s.positions);
  const key = projectIds.join(",");
  return useMemo(
    () => projectIds.map((id) => overviewFrom({ positions } as SpecState, id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, key],
  );
}
