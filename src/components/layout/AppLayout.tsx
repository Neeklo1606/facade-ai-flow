import { Suspense, lazy, type ReactNode } from "react";
import { useApp } from "@/lib/app-context";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomTabs } from "./BottomTabs";
// Палитра поиска грузится при первом открытии: Ctrl+K и кнопки поиска живут в контексте
// приложения, а сама палитра (cmdk) первому экрану не нужна (бюджет бандла, D5)
const CommandPalette = lazy(() =>
  import("./CommandPalette").then((module) => ({ default: module.CommandPalette })),
);
import { GuideDock } from "@/components/guide/GuideDock";

export function AppLayout({ children }: { children: ReactNode }) {
  const { commandOpen } = useApp();
  return (
    <div className="app-window">
      <div className="app-shell">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          {/* Полоса шагов показа под шапкой: не плавает поверх содержимого (ADR-041) */}
          <GuideDock />
          <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
            <main className="min-w-0 flex-1 overflow-y-auto px-[var(--content-pad)] pt-0 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+24px)] lg:pb-8">
              <div className="mx-auto w-full max-w-[1440px]">{children}</div>
            </main>
          </div>
        </div>
        <BottomTabs />
        {commandOpen ? (
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
