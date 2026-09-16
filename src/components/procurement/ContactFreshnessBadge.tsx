import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import { contactStatusLabel as contactFreshnessLabel, type ContactFreshness } from "@/contracts";

const style: Record<ContactFreshness, { className: string; icon: typeof CircleCheck }> = {
  verified: { className: "bg-ok-bg text-ok", icon: CircleCheck },
  needs_check: { className: "bg-warn-bg text-warn", icon: CircleHelp },
  stale: { className: "bg-danger-bg text-danger", icon: CircleX },
};

/** Метка актуальности контакта поставщика. */
export function ContactFreshnessBadge({
  status,
  className,
}: {
  status: ContactFreshness;
  className?: string;
}) {
  const { className: tone, icon: Icon } = style[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="size-3" /> {contactFreshnessLabel[status]}
    </span>
  );
}
