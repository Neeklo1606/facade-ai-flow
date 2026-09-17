import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
  footer,
  ...rest
}: Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
}) {
  return (
    <section {...rest} className={cn("card-surface flex min-w-0 flex-col", className)}>
      {(title || action) && (
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-5 py-3">
          {typeof title === "string" ? <h2 className="text-card-title">{title}</h2> : title}
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
    </section>
  );
}
