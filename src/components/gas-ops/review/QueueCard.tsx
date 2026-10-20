/**
 * Карточка записи в очереди проверки (ADR-044, F5, п. 3): объект крупно, ниже бригада, время
 * и часы, сумма справа, признаки не больше двух. Новая запись этой вкладки с точкой «новая».
 */
import { forwardRef } from "react";
import { fmtRub, useGasActor, type EntryView } from "@/api/gas-ops";
import { EntryStatusBadge, MarkList, SourceMark } from "../marks";
import { entryLine, fmtShortDay, type Mark } from "./rules";
import { cn } from "@/lib/utils";

export const QueueCard = forwardRef<
  HTMLButtonElement,
  {
    view: EntryView;
    marks: Mark[];
    active: boolean;
    fresh: boolean;
    highlight: boolean;
    showStatus: boolean;
    onOpen: () => void;
  }
>(function QueueCard({ view, marks, active, fresh, highlight, showStatus, onOpen }, ref) {
  const { entry } = view;
  // Суммы бригадир не видит (ТЗ, п. 5.6)
  const money = useGasActor().canSeeMoney;
  return (
    <button
      ref={ref}
      type="button"
      data-queue-card={entry.id}
      aria-pressed={active}
      onClick={onOpen}
      className={cn(
        "card-v3 block w-full px-4 py-3.5 text-left transition-fast focus-ring press",
        active ? "ring-2 ring-text/80" : "is-hover:bg-surface-2",
        highlight && "ring-2 ring-orange",
      )}
    >
      <span className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          {fresh ? (
            <span className="mb-1 inline-flex items-center gap-1.5 text-[12px] leading-4 font-medium text-orange">
              <span aria-hidden className="size-2 rounded-full bg-orange" />
              новая
            </span>
          ) : null}
          <span className="line-clamp-2 block text-[16px] leading-[22px] font-semibold tracking-[-0.01em] text-text">
            {view.object?.label ?? "Объект не указан"}
          </span>
        </span>
        <span className="shrink-0 pt-px text-right">
          {money ? (
            <span
              className={cn(
                "block text-[16px] leading-[22px] font-semibold tnum",
                entry.amountRub === null && "font-medium text-text-3",
              )}
            >
              {entry.amountRub === null ? "нет суммы" : fmtRub(entry.amountRub)}
            </span>
          ) : null}
          <span className="block text-[12px] leading-4 text-text-3 tnum">
            {fmtShortDay(entry.day)}
          </span>
        </span>
      </span>
      <span className="mt-1 block text-[13px] leading-5 text-text-2 tnum">{entryLine(view)}</span>
      <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {showStatus ? <EntryStatusBadge status={entry.status} /> : null}
        <MarkList marks={marks} className="min-w-0" />
        <span className="ms-auto text-[12px] leading-4 text-text-3">
          {entry.number} · <SourceMark source={entry.source} />
        </span>
      </span>
    </button>
  );
});
