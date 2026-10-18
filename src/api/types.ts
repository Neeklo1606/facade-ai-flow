/** Типы ответов слоя данных для экранов: экраны не импортируют порты напрямую (P1-7). */
export type {
  AgentIntent,
  AgentReply,
  AgentSource,
  ComparisonCell,
  ComparisonColumn,
  DocumentCard,
  DocumentListItem,
  ImportReport,
  OfferComparison,
  PendingDecision,
  PositionFacetsResult,
  ProjectCard,
  ProjectListItem,
  ReportCard,
  RequestCard,
  ReviewReportInput,
  RequestSummary,
  SourceCard,
  SupplierListItem,
} from "@/ports";

/** Связи между сущностями и происхождение значения (ADR-018): считает домен, показывают экраны */
export type { EntityLink, OriginStep } from "@/domain/links";

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

/** Ход работ и команда объекта (ADR-008): значения уже посчитаны слоем данных */
export type {
  MilestonePoint,
  MilestoneTimeline,
  ProgressMetric,
  TeamCrew,
  TeamMetric,
  TeamPerson,
  ZoneRow,
} from "@/domain/work-progress";

/** Строки экрана «Сегодня» (ADR-028): объёмы и сроки посчитаны слоем данных */
export type { TodayDelivery, TodayReturn, TodayWork } from "@/domain/today";

/** Заявки на материал, сводка смены и черновик разбора — типы для экранов (ADR-037) */
export type { MaterialRequest, MaterialRequestStatus } from "@/contracts";
export type {
  CreateMaterialRequestInput,
  CreateReportInput,
  DecideMaterialRequestInput,
} from "@/ports";
export type { ShiftSummary, ShiftRow } from "@/domain/shift";
export type { DraftCard, DraftField, RequestPrefill } from "@/domain/draft";
