import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Главная метрика экрана. Одна на экран, не больше.
 *
 * Градиента здесь больше нет: вид взят из правок владельца (ADR-030, п. 1) — полоса на
 * поверхности карточки с линиями сверху и снизу. Поэтому подписи подчиняются теме как
 * обычный текст, и проверка читаемости на градиенте к этому блоку не применяется.
 */
export function HeroMetric({
  label,
  value,
  unit,
  secondary,
  note,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Та же величина в других единицах: строка под значением */
  secondary?: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("flex flex-col gap-2 border-y border-line bg-surface px-5 py-4", className)}
    >
      <div className="text-[13px] leading-[1.4] text-text-2">{label}</div>
      <div>
        <div className="text-[32px] leading-tight font-semibold text-text">
          {value}
          {unit && <span className="ml-2 text-[20px] font-medium text-text-2">{unit}</span>}
        </div>
        {secondary && <div className="mt-1 text-[14px] leading-[1.4] text-text-2">{secondary}</div>}
        {note && (
          <div className="mt-2 max-w-[90ch] text-[12px] leading-[1.5] text-text-3">{note}</div>
        )}
      </div>
    </section>
  );
}
