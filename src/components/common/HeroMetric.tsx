import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Главная метрика с фирменным градиентом. Одна на экран, не больше.
 * Слои: --ember, зерно, затемнение 45% для читаемости, контент.
 *
 * Цвета текста — `--on-ember` и `--on-ember-2`: градиент тёмный в обеих темах, поэтому его
 * подписи теме не подчиняются (ADR-017, п. 4). Читаемость проверяет `expectEmberGradient`.
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
      className={cn(
        "relative flex min-h-60 flex-col justify-between gap-4 overflow-hidden rounded-[var(--r-lg)] p-6 shadow-[var(--lift-2),var(--glow-soft)]",
        className,
      )}
    >
      {/* .grain задаёт position: relative, поэтому слой градиента — внутри абсолютной обёртки */}
      <div aria-hidden className="absolute inset-0">
        <div className="bg-ember grain size-full" />
      </div>
      <div aria-hidden className="absolute inset-0 bg-black/45" />
      <div className="relative text-[12px] leading-[1.4] text-on-ember/85">{label}</div>
      <div className="relative">
        <div className="text-[44px] leading-none font-semibold tracking-[-0.025em] text-on-ember sm:text-[56px]">
          {value}
          {unit && (
            <span className="ml-2 text-[25px] font-semibold tracking-[-0.025em] text-on-ember/75 sm:text-[31px]">
              {unit}
            </span>
          )}
        </div>
        {secondary && (
          <div className="mt-2 text-[20px] leading-[1.2] font-medium text-on-ember/85">
            {secondary}
          </div>
        )}
        {note && (
          <div className="mt-3 max-w-[68ch] text-[13px] leading-[1.45] text-on-ember-2">{note}</div>
        )}
      </div>
    </section>
  );
}
