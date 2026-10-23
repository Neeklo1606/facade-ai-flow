import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BRAND, NAV } from "@/lib/site/copy";
import { LEGAL_LINE } from "@/lib/site/config";
import { analyticsConfigured, track, useConsent } from "@/lib/site/analytics";
import { rememberPartnerSrc } from "@/lib/site/partner";
import { useOffline } from "@/lib/ui/offline";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Оболочка публичного сайта (ADR-047, 01_SPEC 5): шапка 56, контент, подвал. Это сайт,
 * а не приложение: нет нижней панели, меню, полосы показа и пометки «Демо» в шапке.
 * Рисуется на сервере целиком, до загрузки скриптов человек видит текст и кнопки.
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  // Код партнёра из ?src= живёт до конца сессии и уходит в заявку (ADR-051)
  useEffect(() => rememberPartnerSrc(window.location.search), []);
  return (
    <div className="flex min-h-dvh flex-col bg-void text-text">
      <a
        href="#site-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        К содержанию
      </a>
      <SiteHeader />
      <SiteOffline />
      <main id="site-main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <ConsentBar />
    </div>
  );
}

function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onDemo = pathname === "/demo";
  // Шапка прозрачная над первым экраном и сплошная с границей, когда страница прокручена
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] transition-[background-color,border-color] duration-150",
        solid ? "border-line bg-void" : "border-transparent bg-transparent",
      )}
    >
      <div className="site-wrap flex h-14 items-center justify-between gap-4">
        <Link
          to="/"
          aria-label="ГАЙКА, на главную"
          className="-mx-2 flex min-h-11 items-center rounded-full px-2 text-title leading-none tracking-tight focus-ring"
        >
          {BRAND.mark}
        </Link>
        {onDemo ? (
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-body text-text-2 focus-ring is-hover:text-text"
          >
            <ArrowLeft className="size-4" aria-hidden />О продукте
          </Link>
        ) : (
          <Link
            to="/demo"
            onClick={() => track("cta_demo", { place: "header" })}
            className="inline-flex min-h-11 items-center rounded-full bg-text px-4 text-body-strong text-void transition-transform duration-100 focus-ring active:scale-[0.98]"
          >
            {NAV.demo}
          </Link>
        )}
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="site-wrap flex flex-col gap-4 py-10 pb-[calc(40px+env(safe-area-inset-bottom))] text-meta text-text-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-text-2">{BRAND.credit}</p>
          {LEGAL_LINE ? <p>{LEGAL_LINE}</p> : null}
        </div>
        <nav aria-label="Ссылки сайта" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            to="/demo"
            className="inline-flex min-h-11 items-center focus-ring is-hover:text-text"
          >
            Демо
          </Link>
          <Link
            to="/privacy"
            className="inline-flex min-h-11 items-center focus-ring is-hover:text-text"
          >
            {NAV.privacy}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/**
 * Согласие на аналитику (ADR-051, 01_SPEC 11.2): строка внизу экрана, пока человек не ответил.
 * Без заданного счётчика строки нет: спрашивать не о чем
 */
function ConsentBar() {
  const [consent, decide] = useConsent();
  if (!analyticsConfigured() || consent !== null) return null;
  return (
    <div
      role="region"
      aria-label="Согласие на аналитику"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="site-wrap flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-text-2">Используем аналитику, чтобы улучшать сайт.</p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => decide("no")}
            className="min-h-11 rounded-full px-4 text-body-strong text-text ring-1 ring-line-2 ring-inset focus-ring"
          >
            Отказаться
          </button>
          <button
            type="button"
            onClick={() => decide("yes")}
            className="min-h-11 rounded-full bg-text px-4 text-body-strong text-void focus-ring"
          >
            Согласиться
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Нет связи (ADR-045, 4.17): полоса под шапкой. Страница уже открыта, а демо и заявке нужна
 * сеть, это и говорим. Имитация в сборке проверки макетов (?offline=1) помечена
 */
function SiteOffline() {
  const { offline, simulated } = useOffline();
  if (!offline) return null;
  return (
    <div role="status" className="bg-warn-bg text-warn">
      <div className="site-wrap flex min-h-10 items-center gap-2 py-2 text-meta">
        <WifiOff className="size-4 shrink-0" aria-hidden />
        <span>Нет связи. Демо и заявка заработают, когда связь вернётся</span>
        {simulated ? <span className="ms-auto shrink-0 text-text-3">имитация</span> : null}
      </div>
    </div>
  );
}
