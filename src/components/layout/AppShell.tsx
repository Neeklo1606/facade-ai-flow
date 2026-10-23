import { Suspense, lazy, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { AccessBoundary } from "@/components/access/AccessBoundary";
import { LegacyBoundary } from "@/components/access/LegacyBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useDemoEvents } from "@/api/demo-events";
import { useScreenTelemetry } from "@/lib/guide/use-screen-telemetry";
import { toast } from "@/lib/toast";
import { AppLayout } from "./AppLayout";

// Выбор роли и оболочки разделов грузятся отдельными кусками: первому экрану они не нужны
const RolePicker = lazy(() =>
  import("@/components/guide/RolePicker").then((module) => ({ default: module.RolePicker })),
);
// Оболочка газа нужна только на /gas/* (ADR-044)
const GasShell = lazy(() =>
  import("@/components/gas-ops/shell/GasShell").then((module) => ({ default: module.GasShell })),
);
// Кабинет компании — отдельная поверхность со своим макетом (ADR-039)
const OfficeLayout = lazy(() =>
  import("./OfficeLayout").then((module) => ({ default: module.OfficeLayout })),
);

/**
 * Оболочка приложения: ГАЙКА, учёт выработки, кабинет компании, выбор роли, тосты,
 * телеметрия показа. Отдельным куском (ADR-050): публичный сайт её не грузит, поэтому
 * первая загрузка лендинга не тянет меню, шапку, панель и словарь экранов.
 */
export default function AppShell({
  pathname,
  queryClient,
  children,
}: {
  pathname: string;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  useDemoEvents(queryClient, (notice) =>
    toast.success(notice.title, { description: notice.description }),
  );
  // Телеметрия сессии: открытие экранов и точка выхода (ADR-010)
  useScreenTelemetry();
  const gas = pathname === "/gas" || pathname.startsWith("/gas/");
  return (
    <TooltipProvider delayDuration={200}>
      {gas ? (
        /* Рабочий контур газа: своя оболочка без меню и персон ГАЙКИ (ADR-044, F1) */
        <Suspense fallback={null}>
          <GasShell>{children}</GasShell>
        </Suspense>
      ) : pathname.startsWith("/office") ? (
        <Suspense fallback={null}>
          <OfficeLayout>
            <AccessBoundary>{children}</AccessBoundary>
          </OfficeLayout>
        </Suspense>
      ) : (
        <AppLayout>
          {/* Раздел, закрытый роли, открывается экраном «Нет доступа» (ADR-012) */}
          {/* Модули прежнего контура за флагом legacy_modules (ADR-034) */}
          <LegacyBoundary>
            <AccessBoundary>{children}</AccessBoundary>
          </LegacyBoundary>
        </AppLayout>
      )}
      {/*
        Выбор роли при первом входе (ADR-010). В разделе «Газ: учёт времени» его нет:
        у направления свой набор ролей и свой переключатель (ADR-043).
      */}
      {gas ? null : (
        <Suspense fallback={null}>
          <RolePicker />
        </Suspense>
      )}
      {/*
        Тосты внизу над нижним слоем (ADR-045, 4.5): отступ из менеджера слоёв, тост
        не закрывает ни нижнюю панель, ни панель действий шторки
      */}
      <Toaster
        position="bottom-center"
        swipeDirections={["bottom"]}
        offset={{ bottom: "calc(var(--bottom-inset, 0px) + 8px)" }}
        mobileOffset={{ bottom: "calc(var(--bottom-inset, 0px) + 8px)" }}
      />
    </TooltipProvider>
  );
}
