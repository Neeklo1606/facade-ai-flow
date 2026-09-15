import type { Tone } from "@/components/common/StatusBadge";
import type {
  DocProcessingStatus,
  ExtractedPosition,
  ProjectOverview,
  ProjectStatus,
  PurchaseStatus,
} from "@/mock/repository";

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

/** Решение человека по позиции словами; null — позиция ещё не разобрана. */
export function reviewLabel(item: ExtractedPosition) {
  switch (item.review) {
    case "confirmed":
      return { label: "Подтверждено", tone: "ok" as const };
    case "corrected":
      return { label: "Исправлено", tone: "info" as const };
    case "excluded":
      return { label: "Исключено", tone: "neutral" as const };
    case "merged":
      return { label: "Объединено", tone: "neutral" as const };
    case "header":
      return { label: "Заголовок", tone: "neutral" as const };
    default:
      return null;
  }
}
