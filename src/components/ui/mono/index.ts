/**
 * Компоненты «Монохрома» (ADR-055, S3, раздел 2.2). Новые экраны S4-S6 собираются из них;
 * каждый показан на /design-system во всех состояниях, в обеих темах и плотностях.
 * Прежний набор ui/kit остаётся у экранов, которые ещё не переведены.
 *
 * График «по времени» не входит в этот вход: он тянет Recharts и импортируется прямо
 * из ./time-chart там, где нужен.
 */
export { Card, MetricCard, MetricRow, ShareBar, Sparkline, type ShareItem } from "./surface";
export {
  Button,
  DeltaChip,
  FormField,
  NumberStepper,
  SegmentedPills,
  SelectSheet,
  StatusChip,
  Toggle,
  type ButtonProps,
  type ButtonVariant,
  type PillOption,
  type StatusTone,
} from "./controls";
export { DataView, DetailPanel, type DataColumn, type DataViewProps } from "./data";
export {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  OfflineBadge,
  Skeleton,
  Stepper,
  Timeline,
  toastUndo,
  type Step,
  type TimelineEvent,
} from "./process";
export { WeekStrip as DateStrip, TimeChips, type WeekDay } from "@/components/ui/kit/date";
