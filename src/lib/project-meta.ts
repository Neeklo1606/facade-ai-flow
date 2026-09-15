import type { Tone } from "@/components/common/StatusBadge";
import type { ProjectOverview, ProjectStatus } from "@/mock/repository";

export const projectStatusMeta: Record<ProjectStatus, { label: string; tone: Tone }> = {
  active: { label: "В работе", tone: "ok" },
  at_risk: { label: "Под риском", tone: "danger" },
  paused: { label: "Приостановлен", tone: "warn" },
  done: { label: "Завершён", tone: "neutral" },
};

export type Attention = "critical" | "warning" | null;

/**
 * Уровень внимания строки реестра.
 * Просроченные ответы поставщиков срывают закупку — это критично.
 * Непроверенные позиции спецификации нельзя отправлять в запрос — это предупреждение.
 */
export function attentionOf(overview: ProjectOverview | null): Attention {
  if (!overview) return null;
  if (overview.overdueRequests > 0) return "critical";
  if (overview.specUnverified > 0) return "warning";
  return null;
}

export const attentionBar: Record<Exclude<Attention, null>, string> = {
  critical: "bg-danger",
  warning: "bg-warn",
};
