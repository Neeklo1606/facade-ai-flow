import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Блок вкладки карточки объекта: заголовок, счётчик и ссылка «открыть полностью». */
export function Block({
  title,
  count,
  to,
  linkLabel = "Открыть полностью",
  onLinkClick,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  count?: ReactNode;
  to?: string;
  linkLabel?: string;
  onLinkClick?: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card-surface flex min-w-0 flex-col", className)}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[14px] font-semibold">{title}</h2>
          {count != null && <span className="tnum text-caption text-text-muted">{count}</span>}
        </div>
        {!to && onLinkClick && (
          <button
            type="button"
            onClick={onLinkClick}
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-[var(--r-xs)] text-caption font-medium text-text-secondary transition-fast hover:text-accent"
          >
            {linkLabel} <ArrowRight className="size-3.5" />
          </button>
        )}
        {to && (
          <Link
            to={to}
            onClick={onLinkClick}
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-[var(--r-xs)] text-caption font-medium text-text-secondary transition-fast hover:text-accent"
          >
            {linkLabel} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </header>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Горизонтальная шкала «часть от целого». */
export function Bar({
  value,
  total,
  tone = "accent",
}: {
  value: number;
  total: number;
  tone?: "accent" | "ok" | "warn" | "danger" | "info";
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const fill = {
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
  }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-subtle" role="presentation">
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Пустое состояние внутри блока — короткое, без иллюстрации. */
export function BlockEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-[13px] text-text-muted">{children}</p>;
}
