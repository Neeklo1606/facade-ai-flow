/** Типы ответов слоя данных для экранов: экраны не импортируют порты напрямую (P1-7). */
export type {
  AgentIntent,
  AgentReply,
  AgentSource,
  ComparisonCell,
  ComparisonColumn,
  DocumentCard,
  DocumentListItem,
  OfferComparison,
  PendingDecision,
  PositionFacetsResult,
  ProjectCard,
  ProjectListItem,
  ReportCard,
  RequestCard,
  RequestSummary,
  SourceCard,
  SupplierListItem,
} from "@/ports";

/** Вид проверки в фильтре позиций */
export type PositionView = NonNullable<import("@/ports").ListPositionsInput["view"]>;

/** Готовые величины дашборда (ADR-007): формулы считает слой данных, экран получает результат */
export type {
  AttentionRow,
  DashboardDelta,
  DashboardInsight,
  DashboardMetric,
  DashboardPeriod,
  ProjectProgress,
  UnclosedVolume,
} from "@/domain/dashboard";
