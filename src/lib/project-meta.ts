import type { Tone } from "@/components/common/StatusBadge";
import {
  positionReviewLabel,
  projectStatusLabel,
  type DocProcessingStatus,
  type ExtractedPosition,
  type ProjectOverview,
  type ProjectStatus,
  type PurchaseStatus,
} from "@/contracts";

const projectStatusTone: Record<ProjectStatus, Tone> = {
  active: "ok",
  at_risk: "danger",
  paused: "warn",
  done: "neutral",
};

/** Подпись из словаря контрактов, цвет — решение интерфейса */
export const projectStatusMeta = Object.fromEntries(
  (Object.keys(projectStatusTone) as ProjectStatus[]).map((status) => [
    status,
    { label: projectStatusLabel[status], tone: projectStatusTone[status] },
  ]),
) as Record<ProjectStatus, { label: string; tone: Tone }>;

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

export const docStatusTone: Record<DocProcessingStatus, Tone> = {
  uploaded: "neutral",
  recognizing: "info",
  extracted: "info",
  review: "warn",
  verified: "ok",
};

export const purchaseTone: Record<PurchaseStatus, Tone> = {
  none: "neutral",
  requested: "info",
  offers: "accent",
  supplier_selected: "accent",
  ordered: "warn",
  delivered: "ok",
};

/** Индекс стадии для документа без живой загрузки — по статусу обработки. */
export function stageOfStatus(status: string) {
  return { uploaded: 0, recognizing: 1, extracted: 3, review: 4, verified: 4 }[status] ?? 0;
}

const reviewTone: Partial<Record<ExtractedPosition["review"], Tone>> = {
  confirmed: "ok",
  corrected: "info",
  excluded: "neutral",
  merged: "neutral",
  header: "neutral",
};

/** Решение человека по позиции словами; null — позиция ещё не разобрана. */
export function reviewLabel(item: ExtractedPosition) {
  const tone = reviewTone[item.review];
  return tone ? { label: positionReviewLabel[item.review], tone } : null;
}
