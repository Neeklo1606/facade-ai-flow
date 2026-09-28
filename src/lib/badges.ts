import type { ProjectOverview } from "@/contracts";
import type { BadgeKey } from "./navigation";

/**
 * Счётчики пунктов навигации: одни и те же числа в сайдбаре и в нижней панели (ADR-026, п. 6).
 * Считаются по сводкам объектов; выбран объект — только по нему.
 */
export const CRITICAL_BADGES: BadgeKey[] = ["overdueRequests"];

export function badgeCounts(
  projectId: string | null,
  overviews: ProjectOverview[],
): Record<BadgeKey, number> {
  const scoped = overviews.filter((item) => (projectId ? item.projectId === projectId : true));
  const total = (pick: (item: (typeof scoped)[number]) => number) =>
    scoped.reduce((acc, item) => acc + pick(item), 0);
  return {
    unverifiedSpec: total((item) => item.specUnverified),
    overdueRequests: total((item) => item.overdueRequests),
    openChanges: total((item) => item.openChanges),
    deliveriesToAccept: total((item) => item.deliveriesToAccept),
  };
}

/** Число на бейдже: до 99 как есть, дальше «99+» — четыре цифры в панели не читаются */
export function badgeText(count: number) {
  return count > 99 ? "99+" : String(count);
}
