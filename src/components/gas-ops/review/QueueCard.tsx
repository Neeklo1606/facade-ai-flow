/**
 * Строка записи в очереди проверки (ADR-045, 4.9 и 5.4): объект text-heading в 1-2 строки,
 * пояснение «Бригада 1 · 12:00 – 14:30 · 2,50 ч», справа сумма и доходность, признаки
 * одной строкой не больше двух и «+N». Новая запись этой вкладки с меткой «новая».
 * Номер записи и источник читаются экранной читалкой и видны в карточке записи.
 */
import { forwardRef } from "react";
import { fmtRate, fmtRub, useGasActor, type EntryView } from "@/api/gas-ops";
import { Chip, ChipRow, type ChipTone } from "@/components/ui/kit/status";
import { EntryStatusBadge } from "../marks";
import { entryLine, type Mark, type MarkLevel } from "./rules";
import { cn } from "@/lib/utils";
import { sourceLabel, useGasContour } from "@/lib/gas-ops/contour";

const TONE: Record<MarkLevel, ChipTone> = { block: "block", decide: "decide", info: "info" };

export const QueueCard = forwardRef<
  HTMLButtonElement,
  {
    view: EntryView;
    marks: Mark[];
    active: boolean;
    fresh: boolean;
    highlight: boolean;
    showStatus: boolean;
    /** Журнал: под суммой номер записи и источник вместо доходности (5.6) */
    showNumber?: boolean;
    onOpen: () => void;
  }
>(function QueueCard(
  { view, marks, active, fresh, highlight, showStatus, showNumber = false, onOpen },
  ref,
) {
  const { entry } = view;
  // Суммы бригадир не видит (ТЗ, п. 5.6)
  const money = useGasActor().canSeeMoney;
  const source = sourceLabel(entry.source, useGasContour().kind);
  return (
    <button
      ref={ref}
      type="button"
      data-queue-card={entry.id}
      aria-pressed={active}
      onClick={onOpen}
      className={cn(
        "flex min-h-row w-full items-start gap-3 px-row py-row text-left transition-fast focus-ring",
        active ? "bg-surface-2" : "is-hover:bg-surface-2 active:bg-surface-2",
        highlight && "ring-2 ring-orange ring-inset",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-heading text-text">
          {view.object?.label ?? "Объект не указан"}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-text-2 tnum">
          {showStatus ? <EntryStatusBadge status={entry.status} className="shrink-0" /> : null}
          {showStatus ? <span aria-hidden>·</span> : null}
          <span className="truncate">{entryLine(view)}</span>
        </span>
        {fresh || marks.length ? (
          <span className="mt-1.5 flex min-w-0 items-center gap-1">
            {fresh ? (
              <Chip tone="neutral" className="shrink-0 text-orange">
                новая
              </Chip>
            ) : null}
            <ChipRow
              className="min-w-0 flex-1"
              chips={marks.map((mark) => ({ label: mark.label, tone: TONE[mark.level] }))}
            />
          </span>
        ) : null}
        {showNumber ? null : (
          <span className="sr-only">
            {entry.number}, {source.toLowerCase()}
          </span>
        )}
      </span>
      {money ? (
        <span className="shrink-0 text-right">
          <span
            className={cn(
              "block text-body-strong tnum",
              entry.amountRub === null && "font-normal text-text-3",
            )}
          >
            {entry.amountRub === null ? "нет суммы" : fmtRub(entry.amountRub)}
          </span>
          {showNumber ? null : view.revenue !== null ? (
            <span className="mt-0.5 block text-meta text-text-3 tnum">{fmtRate(view.revenue)}</span>
          ) : null}
          {showNumber ? (
            <span className="mt-0.5 block text-meta text-text-3 tnum">
              {entry.number} · {source}
            </span>
          ) : null}
        </span>
      ) : null}
      {showNumber && !money ? (
        <span className="shrink-0 text-meta text-text-3 tnum">{entry.number}</span>
      ) : null}
    </button>
  );
});
