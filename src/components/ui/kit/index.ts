/**
 * Компоненты финального интерфейса (ADR-045, раздел 4). Экраны собираются только из них;
 * каждый показан на /design-system во всех состояниях.
 */
export { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
export {
  IconButton,
  Segmented,
  ScrollTabs,
  SearchBar,
  NothingFound,
  FiltersButton,
} from "./controls";
export type { SegmentOption, TabOption } from "./controls";
export { Field, type FieldProps } from "./field";
export { ListRow, ListGroup, type ListRowProps } from "./list";
export { StatusDot, Chip, ChipRow, SourceWord } from "./status";
export type { EntryStatus, ChipTone } from "./status";
export { STATUS_WORD, plural } from "@/lib/ui/kit-logic";
export { Sheet, SidePanel, PickerSheet, FiltersSheet, CalendarSheet, MonthGrid } from "./sheet";
export type { SheetProps, PickOption } from "./sheet";
export { WeekStrip, TimeChips, type WeekDay } from "./date";
export { MetricCard, FieldRow, FieldGroup, DataTable, type TableColumn } from "./data";
export {
  SkeletonRows,
  SkeletonCards,
  EmptyBlock,
  ErrorBlock,
  OfflineBar,
  StageList,
  HintRow,
  type Stage,
} from "./states";
export { notify } from "./toast";
