import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AgentDock } from "@/components/agent/AgentDock";
import { BottomTabs } from "./BottomTabs";
import { CommandPalette } from "./CommandPalette";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-background p-0 text-text-primary lg:p-2">
      <div className="flex h-full min-h-0 overflow-hidden bg-[var(--bg-shell)] shadow-[var(--shadow-shell)] lg:rounded-[var(--r-lg)]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
            <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 pb-24 md:px-7 md:py-6 lg:pb-7">
              <div className="mx-auto w-full max-w-[1680px]">{children}</div>
            </main>
            <AgentDock />
          </div>
        </div>
        <BottomTabs />
        <CommandPalette />
      </div>
    </div>
  );
}
