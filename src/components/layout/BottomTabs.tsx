import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Inbox, LayoutDashboard, MoreHorizontal } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/inbox", label: "Входящие", icon: Inbox },
  { to: "/verification", label: "Проверка", icon: CheckCircle2 },
  { to: "/risks", label: "Риски", icon: AlertTriangle },
];

export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setMobileNavOpen } = useApp();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 backdrop-blur-md lg:hidden md:inset-x-2 md:bottom-2 md:rounded-b-[var(--r-xl)]">
      {tabs.map((t) => {
        const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-fast",
              active ? "text-accent" : "text-text-muted",
            )}
          >
            <t.icon className="size-5" strokeWidth={1.75} />
            {t.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-text-muted"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
        Ещё
      </button>
    </nav>
  );
}
