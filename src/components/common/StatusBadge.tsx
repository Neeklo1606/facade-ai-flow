import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/mock/projects";

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
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-caption font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const projectStatusTone: Record<ProjectStatus, StatusTone> = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
  done: "info",
};

export const projectStatusLabel: Record<ProjectStatus, string> = {
  ok: "В графике",
  warn: "Риск срыва",
  danger: "Отставание",
  done: "Завершен",
};
