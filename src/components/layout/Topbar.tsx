import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Bot, Menu, Search } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { findNavItem } from "@/lib/navigation";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { setMobileNavOpen, setAgentPanelOpen, agentPanelOpen, setCommandOpen } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const item = findNavItem(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:px-6">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Открыть меню"
        className="grid size-11 place-items-center rounded-md text-text-secondary transition-fast hover:bg-subtle lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Хлебные крошки" className="hidden min-w-0 items-center gap-1.5 text-caption text-text-muted md:flex">
        <Link to="/" className="transition-fast hover:text-text-primary">
          neeklo FieldOps
        </Link>
        <span>/</span>
        <span className="truncate text-text-primary">{item?.label ?? "Раздел"}</span>
      </nav>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-subtle px-3 text-caption text-text-muted transition-fast hover:border-border-strong"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Поиск по объектам, событиям, задачам, документам</span>
        <kbd className="ml-auto hidden shrink-0 rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[11px] sm:block">
          Ctrl+K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant={agentPanelOpen ? "default" : "secondary"}
          className="h-9"
          onClick={() => setAgentPanelOpen(!agentPanelOpen)}
        >
          <Bot className="size-4" />
          <span className="hidden sm:inline">Спросить агента</span>
        </Button>
        <button
          type="button"
          aria-label="Уведомления"
          className="relative grid size-9 place-items-center rounded-md text-text-secondary transition-fast hover:bg-subtle"
        >
          <Bell className="size-4.5" />
          <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-medium text-white tnum">
            7
          </span>
        </button>
        <span className="grid size-8 place-items-center rounded-md bg-subtle text-[11px] font-medium">СИ</span>
      </div>
    </header>
  );
}
