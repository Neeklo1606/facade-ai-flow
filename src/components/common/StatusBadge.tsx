import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "danger" | "info" | "neutral" | "accent";

const toneClass: Record<StatusTone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  accent: "bg-accent-subtle text-accent",
  neutral: "bg-subtle text-text-secondary",
};

export function StatusBadge({
  tone = "neutral",
  children,
  dot = false,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-caption font-medium",
        toneClass[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const projectStatusTone = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
  done: "info",
} satisfies Record<string, StatusTone> as Record<string, StatusTone>;

export const projectStatusLabel: Record<string, string> = {
  ok: "В графике",
  warn: "Риск срыва",
  danger: "Отставание",
  done: "Завершен",
};
