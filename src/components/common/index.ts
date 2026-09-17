/** Общая библиотека компонентов интерфейса. Единственный источник — эти файлы. */
export { AppLayout as AppShell } from "@/components/layout/AppLayout";
export { Sidebar } from "@/components/layout/Sidebar";
export { PageHeader } from "./PageHeader";
export { FilterBar, FilterChip } from "./FilterBar";
export { DataTable, type Column } from "./DataTable";
export { EntityDrawer } from "./EntityDrawer";
export {
  MetricStrip,
  MetricStripItem,
  MetricStripSkeleton,
  DeltaPill,
  type Delta,
  type DeltaDirection,
  type DeltaEffect,
  type MetricStripItemProps,
} from "./MetricStrip";
export { HeroMetric } from "./HeroMetric";
export { WidgetCard, WidgetCardHeader, CountPill } from "./WidgetCard";
export { PillTabs, type PillTab } from "./PillTabs";
export {
  WidgetTable,
  PrimaryCell,
  NumberValue,
  InitialsAvatar,
  type WidgetColumn,
} from "./WidgetTable";
export { ProgressBar, ProgressCell, type ProgressTone } from "./ProgressBar";
export { ProgressRing } from "./ProgressRing";
export { StatList } from "./StatList";
export { InsightBlock } from "./InsightBlock";
export { DetailsLayout } from "./DetailsPanel";
export { Field } from "./Field";
export { StatusBadge } from "./StatusBadge";
export { ConfidenceIndicator, confidenceLevel } from "./ConfidenceIndicator";
export { ConfidenceDot } from "./ConfidenceDot";
export { SourceBadge } from "./SourceBadge";
export { SourceRef, SourceDrawer, sourceKindLabel, sourceKindIcon } from "./SourceRef";
export { ExplainPopover } from "./ExplainPopover";
export { ImpactPreview, type ImpactChange } from "./ImpactPreview";
export { EmptyState } from "./EmptyState";
export { ErrorState } from "./ErrorState";
export { Skeleton, SkeletonLine, ListRowSkeleton, TableSkeleton } from "./Skeleton";
export { Panel } from "./Panel";
