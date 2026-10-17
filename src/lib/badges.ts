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

/**
 * Сумма счётчиков пункта: у раздела «Снабжение» одно место под число, а источников три,
 * и на пункте стоит их сумма (ADR-031, п. 4). Разложена она на полосе вкладок раздела.
 */
export function badgeTotal(keys: BadgeKey[] | undefined, counts: Record<BadgeKey, number>) {
  return (keys ?? []).reduce((acc, key) => acc + counts[key], 0);
}

/**
 * Только критические счётчики пункта: число на свёрнутой группе сайдбара означает «здесь
 * просрочено», и непроверенная спецификация в него не входит
 */
export function badgeCriticalTotal(keys: BadgeKey[] | undefined, counts: Record<BadgeKey, number>) {
  return (keys ?? []).reduce(
    (acc, key) => acc + (CRITICAL_BADGES.includes(key) ? counts[key] : 0),
    0,
  );
}

/** Красным — если среди счётчиков пункта есть критический */
export function badgeIsCritical(keys: BadgeKey[] | undefined) {
  return (keys ?? []).some((key) => CRITICAL_BADGES.includes(key));
}

/** Число на бейдже: до 99 как есть, дальше «99+» — четыре цифры в панели не читаются */
export function badgeText(count: number) {
  return count > 99 ? "99+" : String(count);
}
