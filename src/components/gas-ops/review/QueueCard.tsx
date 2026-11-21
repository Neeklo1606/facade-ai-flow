/**
 * Строка записи в очереди проверки и в журнале на телефоне (ADR-061, 10; раздел 4.3): 52 px.
 * Первая строка – бригада и объект, вторая – дата, интервал, часы, состав и чел.-ч. Справа
 * метки замечаний (не больше двух и «+N») и сумма для ролей с доступом к деньгам.
 * На телефоне метки уходят третьей строкой. Номер записи и источник читаются экранной читалкой.
 */
import { Avatar } from "@/components/ui/kit/warm";
import { isAutoAccepted } from "@/api/gas-ops";
import { ChevronDown } from "lucide-react";
import { forwardRef } from "react";
import {
  costBreakdown,
  fmtRub,
  fmtDuration,
  useGasActor,
  type EntryView,
  type Remark,
} from "@/api/gas-ops";
import { Chip } from "@/components/ui/kit/status";
import { EntryStatusBadge } from "../marks";
import { RemarkChips } from "./remarks";
import { entryFrame, fmtShortDay, rowLine } from "./rules";
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
    expanded?: boolean;
    controls?: string;
    roomy?: boolean;
    onOpen: () => void;
  }
>(function QueueCard(
  {
    view,
    remarks,
    active,
    fresh,
    highlight,
    showStatus,
    showNumber = false,
    expanded,
    controls,
    roomy = false,
    onOpen,
  },
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
  if (roomy) {
    const values = [
      { label: "Дата", value: fmtShortDay(entry.day) },
      { label: "Время", value: entryFrame(view) ?? "Не указано" },
      { label: "Работа", value: fmtDuration(entry.minutes) },
      ...(money
        ? [
            {
              label: entry.status === "confirmed" ? "Начислено" : "К проверке",
              value:
                cost.amountRub === null
                  ? "Нет суммы"
                  : `${cost.expected ? "≈ " : ""}${fmtRub(cost.amountRub)}`,
            },
          ]
        : []),
    ];
    return (
      <button
        ref={ref}
        type="button"
        data-queue-card={entry.id}
        aria-expanded={expanded}
        aria-controls={controls}
        onClick={onOpen}
        className={cn(
          "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] content-center gap-2 px-row py-3 text-left transition-fast focus-ring",
          // Телефон (ADR-082): три строки как операция в банке, а не сетка из четырёх значений
          showStatus ? "h-30 sm:h-44" : "h-26 sm:h-36",
          "max-sm:gap-1 max-sm:py-2.5",
          active ? "bg-surface-2" : "is-hover:bg-surface-2",
          highlight && "ring-2 ring-orange ring-inset",
        )}
      >
        <span className="flex min-w-0 items-center gap-3 max-sm:gap-2">
          <Avatar
            name={view.brigade?.name ?? "Бригада"}
            id={view.brigade?.id ?? entry.brigadeId}
            size={36}
            className="max-sm:hidden"
          />
          <span className="min-w-0 truncate text-body-strong">
            {view.brigade?.name ?? "Бригада не указана"} ·{" "}
            {view.object?.label ?? "Объект не указан"}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-5 text-text-3 transition-transform motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        />
        <span className="col-span-2 flex min-w-0 items-baseline justify-between gap-3 sm:hidden">
          <span className="min-w-0 truncate text-meta text-text-2 tnum">
            {fmtShortDay(entry.day)} · {entryFrame(view) ?? "время не указано"} ·{" "}
            {fmtDuration(entry.minutes)}
          </span>
          {money ? (
            <span
              className={cn(
                "shrink-0 text-body-strong tnum",
                cost.amountRub === null && "font-normal text-text-3",
              )}
            >
              {cost.amountRub === null
                ? "нет суммы"
                : `${cost.expected ? "≈ " : ""}${fmtRub(cost.amountRub)}`}
            </span>
          ) : null}
        </span>
        <span className="col-span-2 grid grid-cols-4 gap-x-3 gap-y-2 max-sm:hidden">
          {values.map((item) => (
            <span key={item.label} className="min-w-0">
              <span className="block text-meta text-text-3">{item.label}</span>
              <span className="block whitespace-nowrap text-body-strong tnum">{item.value}</span>
            </span>
          ))}
        </span>
        <span className="col-span-2 min-w-0">
          {marks ?? <span className="text-meta text-ok">Без замечаний</span>}
        </span>
        {showStatus ? (
          <EntryStatusBadge status={entry.status} auto={isAutoAccepted(entry)} />
        ) : null}
        <span className="sr-only">
          {entry.number}, {source}, {rowLine(view)}
        </span>
      </button>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      data-queue-card={entry.id}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onOpen}
      className={cn(
        "min-h-row-compact w-full min-w-0 items-center gap-x-3 gap-y-1 px-row text-left transition-fast focus-ring",
        "flex flex-wrap py-1.5 sm:flex-nowrap",
        active ? "bg-surface-2" : "is-hover:bg-surface-2 active:bg-surface-2",
        highlight && "ring-2 ring-orange ring-inset",
      )}
    >
      <Avatar
        name={view.brigade?.name ?? "Бригада"}
        id={view.brigade?.id ?? entry.brigadeId}
        size={40}
        className="max-sm:hidden"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-strong text-text">
          {view.brigade?.name ?? "Бригада не указана"} · {view.object?.label ?? "Объект не указан"}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-meta text-text-2 tnum">
          {showStatus ? (
            <EntryStatusBadge
              status={entry.status}
              auto={isAutoAccepted(entry)}
              className="shrink-0"
            />
          ) : null}
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
      {expanded !== undefined ? (
        <ChevronDown
          aria-hidden
          className={cn(
            "size-5 shrink-0 text-text-3 transition-transform motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        />
      ) : null}
    </button>
  );
});
