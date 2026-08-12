import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AgentPanel } from "./AgentPanel";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: ReactNode }) {
  const { agentPanelOpen } = useApp();

  return (
    <div className="flex min-h-screen bg-background text-text-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="flex min-w-0 flex-1">
          <main className={cn("min-w-0 flex-1 px-6 py-6", agentPanelOpen && "xl:pr-6")}>
            <div className="mx-auto w-full max-w-[1680px]">{children}</div>
          </main>
          <AgentPanel />
        </div>
      </div>
    </div>
  );
}
