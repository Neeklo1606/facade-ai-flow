/** Общая библиотека компонентов интерфейса. Единственный источник — эти файлы. */
export { AppLayout as AppShell } from "@/components/layout/AppLayout";
export { Sidebar } from "@/components/layout/Sidebar";
export { PageHeader } from "./PageHeader";
export { FilterBar, FilterChip } from "./FilterBar";
export { DataTable, type Column } from "./DataTable";
export { EntityDrawer } from "./EntityDrawer";
export { MetricTile } from "./MetricTile";
export { MetricRing } from "./MetricRing";
export { ProgressRing, type RingStatus } from "./ProgressRing";
export { StatusBadge } from "./StatusBadge";
export { ConfidenceIndicator, confidenceLevel } from "./ConfidenceIndicator";
export { ConfidenceDot } from "./ConfidenceDot";
export { SourceBadge } from "./SourceBadge";
export { SourceRef, SourceDrawer, sourceKindLabel, sourceKindIcon } from "./SourceRef";
export { ExplainPopover } from "./ExplainPopover";
export { ImpactPreview, type ImpactChange } from "./ImpactPreview";
export { EmptyState } from "./EmptyState";
export { ErrorState } from "./ErrorState";
export {
  Skeleton,
  SkeletonLine,
  MetricTileSkeleton,
  ListRowSkeleton,
  TableSkeleton,
} from "./Skeleton";
export { Panel } from "./Panel";
