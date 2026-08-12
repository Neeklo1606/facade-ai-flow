import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
  footer,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
}) {
  return (
    <section className={cn("card-surface flex flex-col", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          {typeof title === "string" ? <h2 className="text-card-title">{title}</h2> : title}
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
    </section>
  );
}
