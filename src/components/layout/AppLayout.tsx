import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AgentPanel } from "./AgentPanel";
import { BottomTabs } from "./BottomTabs";
import { CommandPalette } from "./CommandPalette";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen overflow-x-clip bg-background text-text-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="flex min-w-0 flex-1 items-start">
          <main className="min-w-0 flex-1 px-4 py-4 pb-20 lg:px-6 lg:py-6 lg:pb-6">
            <div className="mx-auto w-full max-w-[1680px]">{children}</div>
          </main>
          <AgentPanel />
        </div>
      </div>
      <BottomTabs />
      <CommandPalette />
    </div>
  );
}
