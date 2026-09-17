/** Типы ответов слоя данных для экранов: экраны не импортируют порты напрямую (P1-7). */
export type {
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
