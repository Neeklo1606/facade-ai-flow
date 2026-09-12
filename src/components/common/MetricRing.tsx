import { ProgressRing, type RingStatus } from "./ProgressRing";

/**
 * Кольцо метрики. Тонкая обёртка над ProgressRing с подписью снизу,
 * чтобы кольцо можно было ставить в ряд метрик рядом с плитками.
 */
export function MetricRing({
  value,
  max = 100,
  status = "accent",
  caption,
  ringLabel,
  threshold,
}: {
  value: number;
  max?: number;
  status?: RingStatus;
  /** подпись под кольцом */
  caption: string;
  /** подпись внутри кольца */
  ringLabel?: string;
  threshold?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <ProgressRing
        value={value}
        max={max}
        status={status}
        {...(ringLabel ? { label: ringLabel } : {})}
        {...(threshold != null ? { threshold } : {})}
      />
      <span className="text-caption text-text-secondary">{caption}</span>
    </div>
  );
}
