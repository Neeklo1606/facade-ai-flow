import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Inbox, LayoutDashboard, ListChecks, Sparkle } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

const left = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/inbox", label: "Входящие", icon: Inbox },
];
const right = [
  { to: "/tasks", label: "Задачи", icon: ListChecks },
  { to: "/risks", label: "Риски", icon: AlertTriangle },
];

export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setAgentPanelOpen, agentPanelOpen } = useApp();

  const Tab = ({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Inbox }) => {
    const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={cn(
          "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-fast",
          active ? "text-accent" : "text-text-muted",
        )}
      >
        <Icon className="size-5" strokeWidth={1.75} />
        {label}
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:inset-x-2 md:bottom-2 md:rounded-b-[var(--r-xl)] lg:hidden">
      {left.map((t) => (
        <Tab key={t.to} {...t} />
      ))}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => setAgentPanelOpen(!agentPanelOpen)}
          aria-label="Открыть агента"
          className="-mt-6 grid size-14 place-items-center rounded-full bg-ink text-primary-foreground shadow-[var(--shadow-md)] transition-fast active:scale-95"
        >
          <Sparkle className="size-6" strokeWidth={1.75} />
        </button>
      </div>
      {right.map((t) => (
        <Tab key={t.to} {...t} />
      ))}
    </nav>
  );
}
