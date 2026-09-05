import { cn } from "@/lib/utils";

export function confidenceLevel(value: number) {
  if (value >= 0.85) return "high" as const;
  if (value >= 0.7) return "mid" as const;
  return "low" as const;
}

const dot: Record<"high" | "mid" | "low", string> = {
  high: "bg-conf-high",
  mid: "bg-conf-mid",
  low: "bg-conf-low",
};

const label: Record<"high" | "mid" | "low", string> = {
  high: "высокая уверенность",
  mid: "средняя уверенность",
  low: "низкая уверенность",
};

/** Единый индикатор уверенности модели. Низкая — всегда с пометкой «требует проверки». */
export function ConfidenceIndicator({
  value,
  showValue = true,
  className,
}: {
  value: number;
  showValue?: boolean;
  className?: string;
}) {
  const level = confidenceLevel(value);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-caption tnum", className)} title={label[level]}>
      <span className={cn("size-2 shrink-0 rounded-full", dot[level])} aria-hidden />
      {showValue && <span className="text-text-secondary">{value.toFixed(2)}</span>}
      {level === "low" && (
        <span className="rounded-sm bg-danger-bg px-1.5 py-0.5 text-[11px] font-medium text-danger">
          требует проверки
        </span>
      )}
    </span>
  );
}
