import type { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Инсайт-блок: вывод, который стоит заметить. Не чаще одного на экран.
 * tone="sand" — для экранов, где единственное оранжевое пятно занято главным действием.
 */
export function InsightBlock({
  icon: Icon = Sparkles,
  title,
  text,
  action,
  tone = "orange",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  text: ReactNode;
  action?: ReactNode;
  tone?: "orange" | "sand";
  className?: string;
}) {
  return (
    <aside
      aria-label={title}
      className={cn(
        "grain flex flex-wrap items-center gap-x-4 gap-y-3 overflow-hidden rounded-[var(--r-md)] px-[22px] py-[18px]",
        tone === "orange"
          ? "border border-orange-line bg-orange-dim"
          : "border border-sand/25 bg-sand-dim",
        className,
      )}
    >
      <span
        className={cn(
          "relative z-[2] grid size-[30px] shrink-0 place-items-center rounded-full",
          tone === "orange" ? "bg-orange" : "bg-sand",
        )}
      >
        <Icon
          className={cn("size-[15px]", tone === "orange" ? "text-white" : "text-void")}
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
      <div className="relative z-[2] min-w-0 flex-1 basis-[calc(100%-46px)] sm:basis-auto">
        <p className="text-[14px] leading-[1.45] font-medium text-text">{title}</p>
        <p className="text-[13px] leading-[1.45] text-text-2">{text}</p>
      </div>
      {/* На узком экране действие уходит под текст, с отступом на ширину иконки */}
      {action && <div className="relative z-[2] shrink-0 pl-[46px] sm:pl-0">{action}</div>}
    </aside>
  );
}
