import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Главная метрика с фирменным градиентом. Одна на экран, не больше.
 * Слои: --ember, зерно, затемнение 18% для читаемости, контент.
 */
export function HeroMetric({
  label,
  value,
  unit,
  note,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative flex h-60 flex-col justify-between overflow-hidden rounded-[var(--r-lg)] p-6 shadow-[var(--lift-2),var(--glow-soft)]",
        className,
      )}
    >
      {/* .grain задаёт position: relative, поэтому слой градиента — внутри абсолютной обёртки */}
      <div aria-hidden className="absolute inset-0">
        <div className="bg-ember grain size-full" />
      </div>
      <div aria-hidden className="absolute inset-0 bg-black/[0.18]" />
      <div className="relative text-[12px] leading-[1.4] text-on-orange/80">{label}</div>
      <div className="relative">
        <div className="text-[56px] leading-none font-semibold tracking-[-0.025em] text-on-orange">
          {value}
          {unit && (
            <span className="ml-2 text-[31px] font-semibold tracking-[-0.025em] text-on-orange/65">
              {unit}
            </span>
          )}
        </div>
        {note && <div className="mt-3 text-[13px] leading-[1.45] text-sand">{note}</div>}
      </div>
    </section>
  );
}
