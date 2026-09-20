import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Пояснение по нажатию, а не по наведению: на телефоне наведения нет, и подсказка
 * по наведению там не открывается вовсе (ADR-015). Кнопка — цель 44 × 44 на телефоне.
 */
export function InfoTip({
  label,
  children,
  icon,
  className,
}: {
  /** Что откроется: для экранного диктора */
  label: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "focus-ring inline-grid size-11 shrink-0 place-items-center rounded-[var(--r-xs)] text-text-muted hover:text-text-primary lg:size-6",
            className,
          )}
        >
          {icon ?? <Info className="size-3.5" strokeWidth={1.5} />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs text-[13px] leading-[1.45]">{children}</PopoverContent>
    </Popover>
  );
}
