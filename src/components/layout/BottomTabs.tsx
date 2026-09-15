import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { allNavItems, mobileTabs } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const tabs = mobileTabs.map((to) => allNavItems.find((item) => item.to === to)!);

export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setMobileNavOpen } = useApp();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_color-mix(in_oklab,var(--bg-page)_45%,transparent)] backdrop-blur-xl lg:hidden">
      {tabs.map(({ to, label, icon: Icon }) => {
        const section = pathname.match(/^\/projects\/[^/]+\/(documents|materials)/)?.[1];
        const active = section
          ? to === `/${section}`
          : pathname === to ||
            pathname.startsWith(`${to}/`) ||
            (to === "/projects" && pathname === "/");
        return (
          <Link
            key={to}
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
      })}
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-text-muted transition-fast"
      >
        <Menu className="size-5" strokeWidth={1.75} />
        Ещё
      </button>
    </nav>
  );
}
