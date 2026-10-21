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
// Полоса показа отдельным куском: первому экрану она не нужна (бюджет бандла, ADR-013)
const GuideDock = lazy(() =>
  import("@/components/guide/GuideDock").then((module) => ({ default: module.GuideDock })),
);
import { useSegScroll } from "@/lib/ui/seg-scroll";
import { useInstallHint } from "@/lib/ui/pwa";
import { useOffline } from "@/lib/ui/offline";
import { OfflineBar } from "@/components/ui/kit/states";
import { useRouterState } from "@tanstack/react-router";

export function AppLayout({ children }: { children: ReactNode }) {
  const { commandOpen } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Ряды капсул, которые не влезают, прокручиваются с затуханием и докручивают активную (4.11)
  useSegScroll(pathname);
  useInstallHint();
  const network = useOffline();
  return (
    <div className="app-window">
      <div className="app-shell">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          {network.offline ? <OfflineBar demo={network.simulated} /> : null}
          {/* Полоса показа под шапкой одной строкой 44: не плавает поверх содержимого (4.4) */}
          <Suspense fallback={null}>
            <GuideDock />
          </Suspense>
          <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
            {/* Нижний отступ из менеджера слоёв: высота нижней панели и 16 (4.4) */}
            <main className="min-w-0 flex-1 overflow-y-auto px-gutter pt-2 pb-inset lg:pt-6 lg:pb-8">
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
