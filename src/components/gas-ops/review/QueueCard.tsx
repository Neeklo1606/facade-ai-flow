/**
 * Строка записи в очереди проверки и в журнале на телефоне (ADR-061, 10; раздел 4.3): 52 px.
 * Первая строка – бригада и объект, вторая – дата, интервал, часы, состав и чел.-ч. Справа
 * метки замечаний (не больше двух и «+N») и сумма для ролей с доступом к деньгам.
 * На телефоне метки уходят третьей строкой. Номер записи и источник читаются экранной читалкой.
 */
import { forwardRef } from "react";
import { costBreakdown, fmtRub, useGasActor, type EntryView, type Remark } from "@/api/gas-ops";
import { Chip } from "@/components/ui/kit/status";
import { EntryStatusBadge } from "../marks";
import { RemarkChips } from "./remarks";
import { rowLine } from "./rules";
import { cn } from "@/lib/utils";
import { sourceLabel, useGasContour } from "@/lib/gas-ops/contour";

export const QueueCard = forwardRef<
  HTMLButtonElement,
  {
    view: EntryView;
    remarks: Remark[];
    active: boolean;
    fresh: boolean;
    highlight: boolean;
    showStatus: boolean;
    /** Журнал: под суммой номер записи и источник */
    showNumber?: boolean;
    onOpen: () => void;
  }
>(function QueueCard(
  { view, remarks, active, fresh, highlight, showStatus, showNumber = false, onOpen },
  ref,
) {
  const { entry } = view;
  // Суммы бригадир не видит (ТЗ, п. 5.6)
  const money = useGasActor().canSeeMoney;
  const source = sourceLabel(entry.source, useGasContour().kind);
  // Ждёт проверки при подтверждённой стоимости: ожидаемая доля по минутам, а не вся смета
  const cost = costBreakdown(view);
  const marks =
    fresh || remarks.length ? (
      <span className="flex min-w-0 items-center gap-1">
        {fresh ? (
          <Chip tone="neutral" className="shrink-0 text-orange">
            новая
          </Chip>
        ) : null}
        <RemarkChips remarks={remarks} className="min-w-0 flex-1" />
      </span>
    ) : null;
  return (
    <button
      ref={ref}
      type="button"
      data-queue-card={entry.id}
      aria-pressed={active}
      onClick={onOpen}
      className={cn(
        "flex min-h-row-compact w-full flex-wrap items-center gap-x-3 gap-y-1 px-row py-1.5 text-left transition-fast focus-ring sm:flex-nowrap",
        active ? "bg-surface-2" : "is-hover:bg-surface-2 active:bg-surface-2",
        highlight && "ring-2 ring-orange ring-inset",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-strong text-text">
          {view.brigade?.name ?? "Бригада не указана"} · {view.object?.label ?? "Объект не указан"}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-meta text-text-2 tnum">
          {showStatus ? <EntryStatusBadge status={entry.status} className="shrink-0" /> : null}
          {showStatus ? <span aria-hidden>·</span> : null}
          <span className="truncate">{rowLine(view)}</span>
        </span>
        <span className="sr-only">
          {entry.number}, {source.toLowerCase()}
        </span>
      </span>
      {marks ? (
        <span className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:max-w-[45%] sm:shrink">
          {marks}
        </span>
      ) : null}
      {money ? (
        <span className="shrink-0 text-right">
          <span
            className={`block text-body-strong tnum ${cost.amountRub === null ? "font-normal text-text-3" : ""}`}
          >
            {cost.amountRub === null
              ? "нет суммы"
              : `${cost.expected ? "≈ " : ""}${fmtRub(cost.amountRub)}`}
          </span>
          {showNumber ? (
            <span className="block text-meta text-text-3 tnum" aria-hidden>
              {entry.number} · {source}
            </span>
          ) : null}
        </span>
      ) : showNumber ? (
        <span className="shrink-0 text-meta text-text-3 tnum" aria-hidden>
          {entry.number}
        </span>
      ) : null}
    </button>
  );
});
