import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const SIZE = 132;
const STROKE = 10;

/**
 * Кольцо прогресса 132px, дуга 10px со скруглёнными концами, фон --surface-3, цвет --orange.
 * Заполнение анимируется один раз при появлении: 700ms ease-out.
 */
export function ProgressRing({
  value,
  max = 100,
  display,
  caption,
  className,
}: {
  value: number;
  max?: number;
  /** Число в центре; по умолчанию — value */
  display?: ReactNode;
  caption?: string;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  // Первый кадр — пустая дуга, следующий — целевое значение: переход срабатывает один раз
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <figure className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={caption}
        className="relative"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke="var(--orange)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={shown ? circumference * (1 - ratio) : circumference}
            style={{ transition: "stroke-dashoffset 700ms ease-out" }}
            // Нулевая дуга со скруглёнными концами рисует точку — прячем её
            opacity={ratio === 0 ? 0 : 1}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[44px] leading-none font-semibold tracking-[-0.025em] text-text tabular-nums">
          {display ?? value}
        </span>
      </div>
      {caption && (
        <figcaption className="text-center text-[13px] leading-[1.45] text-text-3">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
