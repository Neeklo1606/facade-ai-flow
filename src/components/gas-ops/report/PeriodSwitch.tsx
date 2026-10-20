/**
 * Переключатель вида отчёта капсулами (ADR-044, F6): «Вся неделя», дни недели и «Итого
 * недели». На телефоне «Итого недели» не нужен: неделя там и есть итог. Полоса
 * прокручивается пальцем, а не обрезается.
 */
import { useEffect, useRef } from "react";
import type { ReportPeriod } from "@/api/gas-report";
import { cn } from "@/lib/utils";

export function PeriodSwitch({
  days,
  value,
  onChange,
  compact = false,
  className,
}: {
  days: { iso: string; label: string }[];
  value: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
  /** Телефон: «Неделя» и дни, без «Итого недели» */
  compact?: boolean;
  className?: string;
}) {
  const items: { key: string; period: ReportPeriod; label: string }[] = [
    { key: "week", period: "week", label: compact ? "Неделя" : "Вся неделя" },
    ...days.map((day, index) => ({ key: day.iso, period: index, label: day.label })),
    ...(compact ? [] : [{ key: "total", period: "total" as const, label: "Итого недели" }]),
  ];
  const strip = useRef<HTMLDivElement>(null);
  // Выбранный день виден целиком: переход из сценария выбирает субботу в конце полосы
  useEffect(() => {
    const box = strip.current;
    const active = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !active) return;
    const a = active.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const left = box.scrollLeft + a.left - b.left - b.width / 2 + a.width / 2;
    box.scrollTo({ left: Math.max(0, left) });
  }, [value]);
  return (
    <div
      ref={strip}
      className={cn("-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0", className)}
    >
      <div role="tablist" aria-label="Период отчёта" className="seg">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={value === item.period}
            data-period={String(item.period)}
            onClick={() => onChange(item.period)}
            className="seg-item tnum focus-ring"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
