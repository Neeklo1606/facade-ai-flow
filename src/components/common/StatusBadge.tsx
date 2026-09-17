import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "accent";

const tones: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-surface-2 text-text-2",
  accent: "bg-orange-dim text-orange-hot",
};

/** Бейдж статуса: 24px, капсула, 12px/500, фон и текст из пары статуса, без границы */
export function StatusBadge({
  tone = "neutral",
  dot = false,
  children,
  className,
}: {
  tone?: Tone;
  /** Кружок 6px перед текстом */
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-none font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
