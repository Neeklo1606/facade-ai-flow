import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Главное действие экрана (дизайн-система, раздел 8): тёплая капсула с текстом и круглая
 * оранжевая кнопка-стрелка рядом. Одна на кадр: вторая такая же забирает у первой смысл.
 */
export function PrimaryPill({
  label,
  loading = false,
  disabled = false,
  arrow = true,
  onClick,
  className,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  arrow?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        aria-busy={loading}
        className={cn(
          "pill-action focus-ring press text-list",
          "disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {label}
      </button>
      {arrow ? (
        <span
          aria-hidden="true"
          className="bg-ember text-on-orange grid size-14 shrink-0 place-items-center rounded-full lg:size-12"
        >
          <ArrowRight className="size-5" />
        </span>
      ) : null}
    </div>
  );
}
