import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Bot, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarContent } from "./Sidebar";
import { navGroups } from "@/lib/navigation";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

const notifications = [
  {
    day: "Сегодня",
    items: [
      { id: "n1", text: "Гареев Р.М. прислал голосовой отчет по захватке 2", time: "08:12", unread: true },
      { id: "n2", text: "Агент «Контролер сроков» создал 2 задачи по БЦ «Меридиан»", time: "07:05", unread: true },
      { id: "n3", text: "Заявка З-2026-121 разослана 2 поставщикам", time: "06:40", unread: true },
    ],
  },
  {
    day: "Вчера",
    items: [
      { id: "n4", text: "Керамика Трейд ответила по заявке З-2026-114", time: "18:22", unread: false },
      { id: "n5", text: "Волкова Е.С. загрузила КС-2 за июль", time: "16:48", unread: false },
    ],
  },
];

export function Topbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setAgentPanelOpen } = useApp();
  const [mobileNav, setMobileNav] = useState(false);
  const current = navGroups
    .flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })))
    .find((i) => (i.to === "/" ? pathname === "/" : pathname.startsWith(i.to)));
  const unread = notifications.flatMap((g) => g.items).filter((i) => i.unread).length;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:px-6">
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Меню">
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[264px] border-0 p-0">
          <SheetTitle className="sr-only">Навигация</SheetTitle>
          <SidebarContent onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <nav className="hidden min-w-0 items-center gap-1.5 text-table text-text-muted md:flex">
        <Link to="/" className="transition-fast hover:text-text-primary">
          ФАСАД-РП
        </Link>
        {current && (
          <>
            <span>/</span>
            <span className="text-text-secondary">{current.group}</span>
            <span>/</span>
            <span className="truncate font-medium text-text-primary">{current.label}</span>
          </>
        )}
      </nav>

      <div className="mx-auto hidden w-full max-w-md md:block">
        <button className="flex w-full items-center gap-2 rounded-md border border-border bg-subtle px-3 py-1.5 text-left text-table text-text-muted transition-fast hover:bg-background">
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate">Поиск по объектам, задачам, документам…</span>
          <kbd className="rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[11px] text-text-muted">
            Ctrl+K
          </kbd>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setAgentPanelOpen(true)}
        >
          <Bot className="size-4 text-accent" />
          <span className="hidden text-table sm:inline">Спросить агента</span>
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Уведомления">
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="tnum absolute top-1 right-0.5 min-w-4 rounded-sm bg-accent px-1 text-[10px] leading-4 font-medium text-white">
                  {unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-88 p-0" style={{ boxShadow: "var(--shadow-overlay)" }}>
            <div className="border-b border-border px-4 py-3 text-card-title">Уведомления</div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.map((group) => (
                <div key={group.day}>
                  <div className="bg-subtle px-4 py-1.5 text-overline text-text-muted">{group.day}</div>
                  {group.items.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        "flex gap-3 border-b border-border px-4 py-2.5 transition-fast hover:bg-subtle",
                        n.unread && "bg-accent-subtle/60",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          n.unread ? "bg-accent" : "bg-transparent",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-table">{n.text}</div>
                        <div className="tnum text-caption text-text-muted">{n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex size-8 items-center justify-center rounded-md bg-subtle text-caption font-medium">
          СИ
        </div>
      </div>
    </header>
  );
}
