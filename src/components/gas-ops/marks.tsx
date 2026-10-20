/**
 * Метки и мелкие ячейки раздела учёта времени: статус записи, источник данных, признаки
 * проверки, числа в табличном начертании. Один источник правды для всех экранов раздела.
 */
import { StatusBadge } from "@/components/common/StatusBadge";
import type { Tone } from "@/components/common/StatusBadge";
import {
  ENTRY_STATUS_LABEL,
  FLAG_LABEL,
  fmtHours,
  fmtRate,
  fmtRub,
  type DataSource,
  type EntryFlag,
  type EntryStatus,
} from "@/api/gas-ops";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<EntryStatus, Tone> = {
  draft: "neutral",
  pending: "warn",
  confirmed: "ok",
  rejected: "danger",
  clarify: "info",
};

export function EntryStatusBadge({ status }: { status: EntryStatus }) {
  return (
    <StatusBadge tone={STATUS_TONE[status]} dot>
      {ENTRY_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

/** Откуда данные. Имитация помечена рядом со значением, а не в сноске */
export function SourceMark({ source }: { source: DataSource | "mixed" | null }) {
  if (source === null) return null;
  if (source === "fact-report")
    return (
      <StatusBadge tone="neutral" className="font-normal">
        Факт
      </StatusBadge>
    );
  if (source === "mock")
    return (
      <StatusBadge tone="accent" className="font-normal">
        Демо
      </StatusBadge>
    );
  return (
    <StatusBadge tone="neutral" className="font-normal">
      Факт и демо
    </StatusBadge>
  );
}

const FLAG_TONE: Record<EntryFlag, Tone> = {
  "no-amount": "neutral",
  overlap: "danger",
  duplicate: "danger",
  "high-rate": "warn",
  "multi-day-object": "info",
  "no-estimate": "warn",
};

export function FlagList({ flags, className }: { flags: EntryFlag[]; className?: string }) {
  if (flags.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {flags.map((flag) => (
        <li key={flag}>
          <StatusBadge tone={FLAG_TONE[flag]}>{FLAG_LABEL[flag]}</StatusBadge>
        </li>
      ))}
    </ul>
  );
}

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
    <span className="inline-flex items-center gap-1.5 text-[13px] text-warn">
      <StatusBadge tone="warn">Требует согласования</StatusBadge>
      <span className="text-text-2">{children}</span>
    </span>
  );
}
