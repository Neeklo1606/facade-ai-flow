import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode, lazy, Suspense } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { reportClientError, startErrorReporting } from "@/lib/error-report";
import { AccessBoundary } from "@/components/access/AccessBoundary";
import { LegacyBoundary } from "@/components/access/LegacyBoundary";
import { useScreenTelemetry } from "@/lib/guide/use-screen-telemetry";
import { AppProvider } from "@/lib/app-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { BOOT_SPLASH_HTML, BOOT_SPLASH_SCRIPT } from "@/lib/boot-splash";
// Кабинет компании — отдельная поверхность: его макет грузится, только когда открыт /office
// Экран входа показа грузится отдельным куском: до загрузки скриптов его повторяет заставка
// (boot-splash), поэтому первый экран не меняется, а первый кусок держит порог бандла (ADR-044)
const RolePicker = lazy(() =>
  import("@/components/guide/RolePicker").then((module) => ({ default: module.RolePicker })),
);
// Оболочка газа нужна только на /gas/*: в общий набор первого экрана она не едет (ADR-044)
const GasShell = lazy(() =>
  import("@/components/gas-ops/shell/GasShell").then((module) => ({ default: module.GasShell })),
);
const OfficeLayout = lazy(() =>
  import("@/components/layout/OfficeLayout").then((module) => ({ default: module.OfficeLayout })),
);
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { prefetch } from "@/api/prefetch";
import { themeBootScript } from "@/lib/theme";
import { previewMeta } from "@/lib/access";
import { queries } from "@/api/queries";
import { api } from "@/api/client";
import { dataSource, demoShow } from "@/api/config";
import { useDemoEvents } from "@/api/demo-events";
import { toast } from "@/lib/toast";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-page-title">Раздел не найден</h1>
        <p className="mt-2 text-text-secondary">Проверьте адрес или вернитесь к списку объектов.</p>
        <Link
          to="/projects"
          className="text-meta-strong mt-6 inline-flex h-[38px] items-center justify-center rounded-full bg-primary px-[18px] font-medium text-primary-foreground hover:bg-[var(--ink-hover)]"
        >
          К объектам
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    reportClientError(error, { kind: "react_error_boundary" });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-section-title">Экран не загрузился</h1>
        <p className="mt-2 text-text-secondary">
          Данные не удалось отобразить. Попробуйте повторить.
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="text-meta-strong mt-6 inline-flex h-[38px] items-center justify-center rounded-full bg-primary px-[18px] font-medium text-primary-foreground hover:bg-[var(--ink-hover)]"
        >
          Повторить
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Часы и справочники нужны почти каждому экрану: без них SSR отдал бы «—» вместо имён и сроков
  // Рабочий контур: персона — из сессии запроса (ADR-012). Сервер и первый рендер клиента
  // начинают с неё, иначе разметка роли по умолчанию и роли вкладки расходились при гидратации
  loader: async ({ context, location }) => {
    // Экран входа ничего не загружает: сессии нет, и каждый запрос вернул бы 403 в журнал
    if (location.pathname === "/login") return { sessionActorId: null };
    const [session] = await Promise.all([
      dataSource === "server" ? api.session() : null,
      prefetch(context.queryClient, queries.now()),
      prefetch(context.queryClient, queries.employees()),
      prefetch(context.queryClient, queries.counterparties()),
      prefetch(context.queryClient, queries.materials()),
    ]);
    return { sessionActorId: session?.actorId ?? null };
  },
  // Сессия нужна один раз — для первого рендера; дальше персону ведёт вкладка
  staleTime: Infinity,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover: экран с «Домой» занимает весь экран, отступы через safe-area (4.20)
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Гайка" },
      // Умолчание демо — тёмная тема (ADR-041); дальше значение ставит applyTheme
      { name: "theme-color", content: "#0a0908" },
      // Значения по умолчанию для всех экранов: заголовок и описание экраны переопределяют,
      // картинка превью и запрет индексации общие (TASK-A5, п. 2 и 3)
      { title: previewMeta.title },
      { name: "description", content: previewMeta.description },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "гайка" },
      { property: "og:locale", content: "ru_RU" },
      { property: "og:title", content: previewMeta.title },
      { property: "og:description", content: previewMeta.description },
      { property: "og:url", content: previewMeta.url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: previewMeta.title },
      { name: "twitter:description", content: previewMeta.description },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Тема ставится до первой отрисовки, иначе светлая мигает тёмной (ADR-017, п. 7) */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
        <HeadContent />
      </head>
      <body>
        {/* Экран до загрузки скриптов: в демо первый HTML иначе пуст (D5, Lighthouse) */}
        {demoShow ? (
          <>
            <div
              id="boot-splash"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_HTML }}
            />
            <script dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_SCRIPT }} />
          </>
        ) : null}
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const sessionActorId = Route.useLoaderData()?.sessionActorId ?? null;
  useDemoEvents(queryClient, (notice) =>
    toast.success(notice.title, { description: notice.description }),
  );
  // Ловушки необработанных ошибок ставятся один раз на всё приложение (TASK-A5, п. 5)
  useEffect(startErrorReporting, []);
  // Приложение смонтировано: экран до загрузки скриптов уходит (D5)
  useEffect(() => {
    document.documentElement.dataset["booted"] = "";
  }, []);
  // Телеметрия сессии: открытие экранов и точка выхода (ADR-010)
  useScreenTelemetry();
  /*
   * Экран входа рисуется без оболочки: сессии ещё нет, а меню, выбор объекта и проводка
   * запросили бы данные и получили отказ. Тот же случай, что и у экрана-шлюза (ADR-021).
   */
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === "/login") {
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider initialPersona={sessionActorId}>
        <TooltipProvider delayDuration={200}>
          {pathname === "/gas" || pathname.startsWith("/gas/") ? (
            /* Рабочий контур газа: своя оболочка без меню и персон ГАЙКИ (ADR-044, F1) */
            <Suspense fallback={null}>
              <GasShell>
                <Outlet />
              </GasShell>
            </Suspense>
          ) : pathname.startsWith("/office") ? (
            /* Кабинет компании — отдельная поверхность со своим макетом (ADR-039) */
            <Suspense fallback={null}>
              <OfficeLayout>
                <AccessBoundary>
                  <Outlet />
                </AccessBoundary>
              </OfficeLayout>
            </Suspense>
          ) : (
            <AppLayout>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              {/* Раздел, закрытый роли, открывается экраном «Нет доступа» (ADR-012) */}
              {/* Модули прежнего контура за флагом legacy_modules (ADR-034) */}
              <LegacyBoundary>
                <AccessBoundary>
                  <Outlet />
                </AccessBoundary>
              </LegacyBoundary>
            </AppLayout>
          )}
          {/*
            Выбор роли при первом входе (ADR-010); полоса шагов живёт в оболочке (ADR-041).
            В разделе «Газ: учёт времени» его нет: у направления свой набор ролей и свой
            переключатель в шапке раздела, два выбора роли подряд только путают (ADR-043).
          */}
          {pathname.startsWith("/gas") ? null : (
            <Suspense fallback={null}>
              <RolePicker />
            </Suspense>
          )}
          {/*
            Тосты внизу над нижним слоем (ADR-045, 4.5): отступ берётся из менеджера слоёв,
            поэтому тост не закрывает ни нижнюю панель, ни панель действий шторки.
            Сверху они закрывали заголовок экрана (refs/02, 04).
          */}
          <Toaster
            position="bottom-center"
            swipeDirections={["bottom"]}
            offset={{ bottom: "calc(var(--bottom-inset, 0px) + 8px)" }}
            mobileOffset={{ bottom: "calc(var(--bottom-inset, 0px) + 8px)" }}
          />
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
