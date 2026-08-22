import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { mobileTabs, navGroupsForRole } from "@/lib/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function BottomTabs() {
  const { account } = useAuth();
  const [more, setMore] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!account) return null;

  const groups = navGroupsForRole(account.role);
  const items = groups.flatMap((g) => g.items);
  const tabs = mobileTabs
    .map((to) => items.find((i) => i.to === to))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));
  const rest = items.filter((i) => !mobileTabs.includes(i.to as (typeof mobileTabs)[number]));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <ul className="grid grid-cols-5">
          {tabs.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] leading-tight transition-fast",
                    active ? "text-accent" : "text-text-muted",
                  )}
                >
                  <item.icon className="size-5" strokeWidth={1.75} />
                  <span className="w-full truncate text-center">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setMore(true)}
              className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] leading-tight text-text-muted transition-fast"
            >
              <MoreHorizontal className="size-5" strokeWidth={1.75} />
              <span>Ещё</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto p-0">
          <SheetTitle className="border-b border-border px-4 py-3 text-card-title">
            Все разделы
          </SheetTitle>
          <ul className="p-2">
            {rest.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setMore(false)}
                  className="flex min-h-11 items-center gap-3 rounded-full px-3 py-2.5 text-table transition-fast hover:bg-subtle"
                >
                  <item.icon className="size-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
