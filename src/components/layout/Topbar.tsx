import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Bot, Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarContent } from "./Sidebar";
import { findNavItem, navGroupsForRole } from "@/lib/navigation";
import { useApp } from "@/lib/app-context";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const notifications = [
  {
    day: "Сегодня",
    items: [
      { id: "n1", text: "Гареев Р.М. прислал голосовой отчёт по захватке 2", time: "08:12", unread: true },
      { id: "n2", text: "Агент «Контролер сроков» создал 2 задачи по БЦ «Меридиан»", time: "07:05", unread: true },
      { id: "n3", text: "Заявка З-2026-121 разослана 2 поставщикам (демо-имитация)", time: "06:40", unread: true },
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
  const { account } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState(false);
  const groups = navGroupsForRole(account?.role ?? "pm");
  const current = findNavItem(pathname);
  const group = groups.find((g) => g.items.some((i) => i.to === current?.to))?.title;
  const unread = notifications.flatMap((g) => g.items).filter((i) => i.unread).length;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] px-3 backdrop-blur-xl lg:gap-3 lg:px-6">
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11 lg:hidden" aria-label="Меню">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] border-0 p-0">
          <SheetTitle className="sr-only">Навигация</SheetTitle>
          <SidebarContent onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1 truncate text-card-title lg:hidden">
        {current?.label ?? "ФАСАД-РП"}
      </div>

      <nav className="hidden min-w-0 items-center gap-1.5 text-table text-text-muted md:flex">
        <Link to="/dashboard" className="transition-fast hover:text-text-primary">
          ФАСАД-РП
        </Link>
        {current && (
          <>
            <span>/</span>
            <span className="text-text-secondary">{group}</span>
            <span>/</span>
            <span className="truncate font-medium text-text-primary">{current.label}</span>
          </>
        )}
      </nav>

      <div className="mx-auto hidden w-full max-w-md md:block">
        <button
          onClick={() => setSearch(true)}
          className="flex w-full items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-2 text-left text-table text-text-muted transition-fast hover:border-[color:var(--border-strong)]"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate">Поиск по объектам, задачам, документам…</span>
          <kbd className="rounded-full border border-border bg-[color:var(--bg-elevated)] px-2 py-0.5 text-[11px] text-text-muted">
            Ctrl+K
          </kbd>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1 lg:gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Поиск"
          className="size-11 md:hidden"
          onClick={() => setSearch(true)}
        >
          <Search className="size-5" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="hidden gap-2 md:inline-flex"
          onClick={() => setAgentPanelOpen(true)}
        >
          <Bot className="size-4 text-accent" />
          <span className="text-table">Спросить агента</span>
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative size-11 lg:size-9"
              aria-label="Уведомления"
            >
              <Bell className="size-5 lg:size-4" />
              {unread > 0 && (
                <span className="tnum absolute top-1 right-0.5 min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 font-medium text-accent-foreground">
                  {unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(22rem,calc(100vw-2rem))] p-0"
            style={{ boxShadow: "var(--shadow-overlay)" }}
          >
            <div className="border-b border-border px-4 py-3 text-card-title">Уведомления</div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.map((g) => (
                <div key={g.day}>
                  <div className="bg-subtle px-4 py-1.5 text-overline text-text-muted">{g.day}</div>
                  {g.items.map((n) => (
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

        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-caption font-medium text-accent-foreground"
          title={`${account?.user.name} · ${account?.roleLabel}`}
        >
          {account?.user.initials ?? "—"}
        </div>
        <span className="hidden text-caption text-text-muted xl:inline">{account?.roleLabel}</span>
      </div>

      <Dialog open={search} onOpenChange={setSearch}>
        <DialogContent
          className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none p-0 sm:top-[10%] sm:left-1/2 sm:h-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">Поиск</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-4 shrink-0 text-text-muted" />
            <input
              autoFocus
              placeholder="Поиск по объектам, задачам, документам…"
              className="h-11 min-w-0 flex-1 bg-transparent text-table outline-none placeholder:text-text-muted"
            />
            <Button variant="ghost" size="icon" className="size-11" onClick={() => setSearch(false)} aria-label="Закрыть">
              <X className="size-5" />
            </Button>
          </div>
          <div className="px-4 py-6 text-caption text-text-muted">
            Демо-поиск: индексация синтетических данных появится на следующем шаге прототипа.
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
