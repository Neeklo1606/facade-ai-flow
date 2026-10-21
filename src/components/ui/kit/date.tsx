/**
 * Дата и время ADR-045, раздел 4.8: полоса недели (7 дней, кнопки 44, сегодня с точкой)
 * и кнопки времени для бота бригадира (48, полевое действие; занятые недоступны с подписью).
 */
import { cn } from "@/lib/utils";

export interface WeekDay {
  /** «ГГГГ-ММ-ДД» */
  date: string;
  /** «Пн» */
  weekday: string;
  /** «28» */
  day: string;
  /** Счётчик под днём, если есть: записи за день */
  count?: number;
}

/** Полоса недели: «Неделя» и семь дней, выбранный акцентом, сегодня с точкой */
export function WeekStrip({
  days,
  value,
  today,
  onChange,
  allLabel,
  label = "Дни недели",
  className,
}: {
  days: readonly WeekDay[];
  /** null: выбрана вся неделя */
  value: string | null;
  today?: string;
  onChange: (date: string | null) => void;
  /** Кнопка «Неделя» перед днями */
  allLabel?: string;
  label?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex items-stretch gap-1", className)}>
      {allLabel ? (
        <button
          type="button"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={cn(
            "flex h-control shrink-0 items-center rounded-full px-3 focus-ring transition-fast",
            value === null
              ? "bg-pill text-body-strong text-pill-text"
              : "text-body text-text-2 is-hover:bg-surface-2",
          )}
        >
          {allLabel}
        </button>
      ) : null}
      {days.map((d) => {
        const on = d.date === value;
        const isToday = d.date === today;
        return (
          <button
            key={d.date}
            type="button"
            aria-pressed={on}
            aria-current={isToday ? "date" : undefined}
            aria-label={`${d.weekday} ${d.day}${isToday ? ", сегодня" : ""}${d.count !== undefined ? `, записей ${d.count}` : ""}`}
            onClick={() => onChange(d.date)}
            className={cn(
              "relative flex min-h-control min-w-10 flex-1 flex-col items-center justify-center rounded-control focus-ring transition-fast",
              // Выбранный день тёмной заливкой: акцент экрана остаётся у главного действия
              on ? "bg-pill text-pill-text" : "text-text is-hover:bg-surface-2",
            )}
          >
            <span className={cn("text-meta", on ? "text-pill-text" : "text-text-3")}>
              {d.weekday}
            </span>
            <span className="text-body-strong tnum">{d.day}</span>
            {isToday ? (
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-0.5 size-1 rounded-full",
                  on ? "bg-pill-text" : "bg-orange",
                )}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Кнопки времени: 48 (перчатки), сетка в 3 колонки, занятые недоступны с подписью «занято» */
export function TimeChips({
  slots,
  busy = [],
  value,
  onPick,
  label,
  other,
}: {
  slots: readonly string[];
  busy?: readonly string[];
  value?: string | null;
  onPick: (time: string) => void;
  label: string;
  /** «Другое время»: открывает поле с маской */
  other?: () => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
      {slots.map((time) => {
        const taken = busy.includes(time);
        const on = time === value;
        return (
          <button
            key={time}
            type="button"
            disabled={taken}
            aria-pressed={on}
            aria-label={taken ? `${time}, занято` : time}
            onClick={() => onPick(time)}
            className={cn(
              "flex h-control-lg flex-col items-center justify-center rounded-control border text-body-strong tnum focus-ring press-98 disabled:cursor-not-allowed",
              on
                ? "border-orange-strong bg-orange-strong text-on-orange"
                : "border-line-2 bg-surface text-text",
              taken && "border-line bg-surface-2 text-text-3",
            )}
          >
            {time}
            {taken ? <span className="text-meta text-text-3">занято</span> : null}
          </button>
        );
      })}
      {other ? (
        <button
          type="button"
          onClick={other}
          className="col-span-3 h-control-lg rounded-control border border-line-2 bg-surface text-body-strong focus-ring press-98"
        >
          Другое время
        </button>
      ) : null}
    </div>
  );
}
