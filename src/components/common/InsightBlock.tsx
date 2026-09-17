import type { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Инсайт-блок: вывод, который стоит заметить. Не чаще одного на экран. */
export function InsightBlock({
  icon: Icon = Sparkles,
  title,
  text,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  text: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "grain flex flex-wrap items-center gap-x-4 gap-y-3 overflow-hidden rounded-[var(--r-md)] border border-orange-line bg-orange-dim px-[22px] py-[18px]",
        className,
      )}
    >
      <span className="relative z-[2] grid size-[30px] shrink-0 place-items-center rounded-full bg-orange">
        <Icon className="size-[15px] text-white" strokeWidth={1.75} aria-hidden />
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
