import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { reportClientError, startErrorReporting } from "@/lib/error-report";
import { RolePicker } from "@/components/guide/RolePicker";
import { GuideDock } from "@/components/guide/GuideDock";
import { AccessBoundary } from "@/components/access/AccessBoundary";
import { useScreenTelemetry } from "@/lib/guide/use-screen-telemetry";
import { markStartScreenApplied } from "@/lib/navigation";
import { AppProvider } from "@/lib/app-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { prefetch } from "@/api/prefetch";
import { themeBootScript } from "@/lib/theme";
import { previewMeta } from "@/lib/access";
import { queries } from "@/api/queries";
import { api } from "@/api/client";
import { dataSource } from "@/api/config";
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
          className="mt-6 inline-flex h-[38px] items-center justify-center rounded-full bg-primary px-[18px] text-[13px] font-medium text-primary-foreground hover:bg-[var(--ink-hover)]"
        >
          К объектам
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
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
          className="mt-6 inline-flex h-[38px] items-center justify-center rounded-full bg-primary px-[18px] text-[13px] font-medium text-primary-foreground hover:bg-[var(--ink-hover)]"
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
  loader: async ({ context }) => {
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#000000" },
      // Значения по умолчанию для всех экранов: заголовок и описание экраны переопределяют,
      // картинка превью и запрет индексации общие (TASK-A5, п. 2 и 3)
      { title: previewMeta.title },
      { name: "description", content: previewMeta.description },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "neeklo FieldOps" },
      { property: "og:locale", content: "ru_RU" },
      { property: "og:title", content: previewMeta.title },
      { property: "og:description", content: previewMeta.description },
      { property: "og:url", content: previewMeta.url },
      { property: "og:image", content: previewMeta.url.replace(/\/$/, "") + previewMeta.image },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Дашборд neeklo FieldOps" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: previewMeta.title },
      { name: "twitter:description", content: previewMeta.description },
      { name: "twitter:image", content: previewMeta.url.replace(/\/$/, "") + previewMeta.image },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
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
    <html lang="ru">
      <head>
        {/* Тема ставится до первой отрисовки, иначе светлая мигает тёмной (ADR-017, п. 7) */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { sessionActorId } = Route.useLoaderData();
  useDemoEvents(queryClient, (notice) =>
    toast.success(notice.title, { description: notice.description }),
  );
  // Ловушки необработанных ошибок ставятся один раз на всё приложение (TASK-A5, п. 5)
  useEffect(startErrorReporting, []);
  // Вход в демонстрацию — первый отрисованный экран вкладки, какой угодно. Пока отметка ставилась
  // только на «/», вошедший по прямой ссылке терял первый клик по «Дашборд» (находка ревью)
  useEffect(markStartScreenApplied, []);
  // Телеметрия сессии: открытие экранов и точка выхода (ADR-010)
  useScreenTelemetry();

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider initialPersona={sessionActorId}>
        <TooltipProvider delayDuration={200}>
          <AppLayout>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            {/* Раздел, закрытый роли, открывается экраном «Нет доступа» (ADR-012) */}
            <AccessBoundary>
              <Outlet />
            </AccessBoundary>
          </AppLayout>
          {/* Выбор роли при первом входе, проводка и обратная связь (ADR-010) */}
          <GuideDock />
          <RolePicker />
          {/* Сверху, под шапкой: снизу уведомления перекрывали основные действия экранов и нижнюю навигацию */}
          <Toaster position="top-center" offset={{ top: 64 }} mobileOffset={{ top: 64 }} />
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
