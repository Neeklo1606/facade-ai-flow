/**
 * Метки и мелкие ячейки раздела учёта времени: статус записи, источник данных, признаки
 * проверки, числа в табличном начертании. Один источник правды для всех экранов раздела.
 *
 * Иерархия меток (ADR-044, F5, п. 2): статус один и текстом с точкой; признаки в три уровня:
 * красный блокирует решение, янтарный требует решения, серый только сообщает. На карточке
 * списка не больше двух признаков, остальные «+N» и в деталях. «Факт» и «Демо» тихой подписью.
 */
import {
  ENTRY_STATUS_LABEL,
  fmtHours,
  fmtRate,
  fmtRub,
  type DataSource,
  type EntryFlag,
  type EntryStatus,
} from "@/api/gas-ops";
import { FLAG_LEVEL, LEVEL_ORDER, MARK_BASE, type Mark, type MarkLevel } from "./review/rules";
import { ChipRow, type ChipTone } from "@/components/ui/kit/status";
import { cn } from "@/lib/utils";
import { sourceLabel, useGasContour } from "@/lib/gas-ops/contour";

/* ---------------------------------------------------------------- Статус */

const STATUS_DOT: Record<EntryStatus, string> = {
  draft: "bg-text-3",
  pending: "bg-warn",
  confirmed: "bg-ok",
  rejected: "bg-danger",
  clarify: "bg-info",
};

/** Статус записи: текст с цветной точкой, без плашки. Один на запись */
export function EntryStatusBadge({
  status,
  className,
}: {
  status: EntryStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-meta whitespace-nowrap text-text-2",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
      {ENTRY_STATUS_LABEL[status]}
    </span>
  );
}

/** Откуда данные. Имитация помечена рядом со значением тихой серой подписью */
export function SourceMark({
  source,
  className,
}: {
  source: DataSource | "mixed" | null;
  className?: string;
}) {
  const kind = useGasContour().kind;
  if (source === null) return null;
  const text = sourceLabel(source, kind);
  return <span className={cn("text-meta whitespace-nowrap text-text-3", className)}>{text}</span>;
}

/* ---------------------------------------------------------------- Признаки */

const LEVEL_TONE: Record<MarkLevel, string> = {
  block: "bg-danger-bg text-danger",
  decide: "bg-warn-bg text-warn",
  info: "bg-surface-2 text-text-2",
};

export function MarkChip({ mark }: { mark: Pick<Mark, "label" | "level"> }) {
  return (
    <span
      className={cn(
        "inline-flex h-chip items-center rounded-full px-2 text-meta-strong whitespace-nowrap",
        LEVEL_TONE[mark.level],
      )}
    >
      {mark.label}
    </span>
  );
}

const CHIP_TONE: Record<MarkLevel, ChipTone> = { block: "block", decide: "decide", info: "info" };

/**
 * Признаки одной строкой (ADR-045, 4.10): сколько влезает, не больше `max`, остальные «+N»,
 * без переноса на новую строку (refs/02). Полный список в «Почему помечено».
 */
export function MarkList({
  marks,
  max = 2,
  className,
}: {
  marks: Mark[];
  max?: number;
  className?: string | undefined;
}) {
  if (marks.length === 0) return null;
  return (
    <ChipRow
      max={max}
      {...(className ? { className } : {})}
      chips={marks.map((mark) => ({ label: mark.label, tone: CHIP_TONE[mark.level] }))}
    />
  );
}

/** Признаки по одним флагам домена: для объектов и строк, где записи целиком нет */
export function FlagList({
  flags,
  max = 2,
  className,
}: {
  flags: EntryFlag[];
  max?: number;
  className?: string;
}) {
  const marks: Mark[] = flags
    .map((key) => ({ key, ...MARK_BASE[key], level: FLAG_LEVEL[key] }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return <MarkList marks={marks} max={max} className={className} />;
}

/* ---------------------------------------------------------------- Числа */

/** Число в таблице: табличное начертание, выравнивание вправо, прочерк вместо нуля */
export function Num({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return <span className={cn("tabular-nums", className)}>{children}</span>;
}

export function MoneyCell({ value }: { value: number | null }) {
  return (
    <Num className={value === null ? "text-text-3" : undefined}>
      {value === null ? "—" : fmtRub(value)}
    </Num>
  );
}

export function HoursCell({ minutes }: { minutes: number | null }) {
  return (
    <Num className={minutes === null || minutes === 0 ? "text-text-3" : undefined}>
      {minutes === null || minutes === 0 ? "—" : fmtHours(minutes / 60)}
    </Num>
  );
}

export function RateCell({ value }: { value: number | null }) {
  return <Num className={value === null ? "text-text-3" : undefined}>{fmtRate(value)}</Num>;
}

/** Текст «что требует согласования»: открытый вопрос показывается рядом со значением */
export function NeedsAgreement({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-meta">
      <MarkChip mark={{ label: "Требует согласования", level: "info" }} />
      <span className="text-text-2">{children}</span>
    </span>
  );
}
