import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomTabs } from "./BottomTabs";
import { CommandPalette } from "./CommandPalette";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-window">
      {/* Фоновое свечение окна: одно пятно, левый нижний угол */}
      <div aria-hidden className="app-glow grain">
        <div className="app-glow-shape" />
      </div>
      <div className="app-shell">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
            <main className="min-w-0 flex-1 overflow-y-auto px-[var(--content-pad)] pt-0 pb-[calc(var(--bottom-nav-h)+24px)] lg:pb-8">
              <div className="mx-auto w-full max-w-[1680px]">{children}</div>
            </main>
          </div>
        </div>
        <BottomTabs />
        <CommandPalette />
      </div>
    </div>
  );
}
