/**
 * Сведения о записи на экранах проверки и журнала (ADR-061, 10): метки замечаний по типам,
 * таблетки статусов со счётчиками и «не рассчитано» вместо нуля. Правила в domain
 * (`entry-info.ts`), здесь только вид.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Remark } from "@/api/gas-ops";
import { ChipRow } from "@/components/ui/kit/status";
import { KIND_TONE } from "./kind";
import { cn } from "@/lib/utils";

/** Метки замечаний одной строкой: не больше двух и «+N». Тип читается экранной читалкой */
export function RemarkChips({ remarks, className }: { remarks: Remark[]; className?: string }) {
  if (!remarks.length) return null;
  return (
    <ChipRow
      {...(className ? { className } : {})}
      chips={remarks.map((r) => ({ label: r.label, tone: KIND_TONE[r.kind] }))}
    />
  );
}

export interface PillOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

/**
 * Таблетки статусов со счётчиками по образцу ПТО Онлайн (2.2). Роль вкладок: одна выбрана,
 * стрелки не нужны — таблеток четыре.
 */
export function StatusPills<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(option.value)}
            // Размер и цвет строкой, не через cn: tailwind-merge считает text-body и text-text-2 одной группой
            className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-body whitespace-nowrap transition-fast focus-ring lg:h-control-sm ${
              on
                ? "border-transparent bg-pill text-pill-text"
                : "border-line-2 bg-surface text-text-2 is-hover:bg-surface-2"
            }`}
          >
            {option.label}
            <span className={`text-meta tnum ${on ? "opacity-75" : "text-text-3"}`}>
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * «Не рассчитано · в 93 записях нет состава · Показать записи» (2.3, п. 2). Ссылка ведёт
 * в журнал с фильтром записей без состава.
 */
export function NotCalculated({
  reason,
  className,
  children,
}: {
  reason: string | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5", className)}>
      <span className="text-text-2">{children ?? "не рассчитано"}</span>
      {reason ? <span className="text-meta text-text-3">· {reason}</span> : null}
      {reason && reason !== "записей нет" ? (
        <Link
          to="/gas/entries"
          search={{ crew: "none" }}
          className="inline-flex min-h-control-sm items-center text-meta-strong text-orange focus-ring"
        >
          Показать записи
        </Link>
      ) : null}
    </span>
  );
}
