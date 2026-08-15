import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AgentPanel } from "./AgentPanel";
import { BottomTabs } from "./BottomTabs";
import { AccessDenied } from "@/components/common/AccessDenied";
import { useApp } from "@/lib/app-context";
import { useAuth } from "@/lib/auth-context";
import { canAccess } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: ReactNode }) {
  const { agentPanelOpen } = useApp();
  const { account } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = pathname === "/login" || pathname === "/";

  useEffect(() => {
    if (!account && !isPublic) navigate({ to: "/login", replace: true });
  }, [account, isPublic, navigate]);

  if (isPublic) return <>{children}</>;
  if (!account) return null;

  const allowed = canAccess(account.role, pathname);

  return (
    <div className="flex min-h-screen bg-background text-text-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="flex min-w-0 flex-1">
          <main
            className={cn(
              "min-w-0 flex-1 px-4 py-4 pb-24 lg:px-6 lg:py-6 lg:pb-6",
              agentPanelOpen && "xl:pr-6",
            )}
          >
            <div className="mx-auto w-full max-w-[1680px]">
              {allowed ? children : <AccessDenied role={account.roleLabel} />}
            </div>
          </main>
          <AgentPanel />
        </div>
      </div>
      <BottomTabs />
    </div>
  );
}
