import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ArrowUpRight, ChevronDown, Menu, WifiOff, X } from "lucide-react";
import { BRAND, FOOTER, NAV, TASKS } from "@/lib/site/copy";
import { contactTgUrl, LEGAL_LINE } from "@/lib/site/config";
import { analyticsConfigured, track, useConsent } from "@/lib/site/analytics";
import { rememberPartnerSrc } from "@/lib/site/partner";
import { useOffline } from "@/lib/ui/offline";
import { cn } from "@/lib/utils";
import { siteButton } from "./parts";
import { useSiteReveal } from "./motion";

/**
 * Оболочка публичного сайта (ADR-047, ADR-067): шапка 56 с разделами, контент, подвал.
 * Это сайт, а не приложение: нет нижней панели и выбора роли. Рисуется на сервере целиком,
 * до загрузки скриптов человек видит текст и ссылки.
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  // Код партнёра из ?src= живёт до конца сессии и уходит в заявку (ADR-051)
  useEffect(() => rememberPartnerSrc(window.location.search), []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useSiteReveal(pathname);
  return (
    <div className="site-page flex min-h-dvh flex-col bg-void text-text">
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

const navLink =
  "inline-flex min-h-11 items-center rounded-full px-3 text-body text-text-2 transition-colors duration-150 focus-ring is-hover:text-text";

function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
        "site-header sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] transition-[background-color,border-color] duration-150",
        solid ? "border-line bg-void" : "border-transparent bg-void",
      )}
    >
      <div className="site-wrap flex h-14 items-center justify-between gap-3">
        <Link
          to="/"
          aria-label="ГАЙКА, на главную"
          className="-mx-2 flex min-h-11 items-center rounded-full px-2 text-title leading-none tracking-tight focus-ring"
        >
          {BRAND.mark}
        </Link>
        <nav aria-label="Разделы сайта" className="site-nav-desktop items-center gap-1">
          <TasksMenu pathname={pathname} />
          <Link to="/case/gas" className={navLink}>
            {NAV.case}
          </Link>
          <Link to="/demo" className={navLink}>
            {NAV.demoShort}
          </Link>
          <Link
            to="/razbor"
            onClick={() => track("cta_razbor", { place: "header" })}
            className={cn(siteButton.primary, "site-btn-sm ms-2")}
          >
            {NAV.talk}
          </Link>
        </nav>
        <div className="site-nav-mobile items-center gap-1">
          <Link
            to="/demo"
            onClick={() => track("cta_demo", { place: "header" })}
            className={cn(siteButton.secondary, "site-btn-sm")}
          >
            {NAV.demoShort}
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

/** «Задачи ▾» на компьютере: три страницы задач. Escape и уход фокуса закрывают список */
function TasksMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const active = TASKS.some((task) => task.path === pathname);
  return (
    <div
      ref={root}
      className="relative"
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="site-tasks-menu"
        onClick={() => setOpen((value) => !value)}
        className={cn(navLink, "gap-1", active && "text-text")}
      >
        {NAV.tasks}
        <ChevronDown
          className={cn("size-4 transition-transform duration-150", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <div
        id="site-tasks-menu"
        hidden={!open}
        className="site-menu-pop absolute top-full left-0 mt-2 w-[340px] rounded-card bg-surface p-2"
      >
        <ul className="flex flex-col">
          {TASKS.map((task) => (
            <li key={task.key}>
              <Link
                to={task.path}
                aria-current={task.path === pathname ? "page" : undefined}
                className="flex flex-col gap-0.5 rounded-control px-3 py-3 focus-ring is-hover:bg-surface-2"
              >
                <span className="text-body-strong text-text">{task.title}</span>
                <span className="text-meta text-text-3">{task.short}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Меню телефона (ADR-067, раздел 5.1): шторка на всю высоту, пункты строками 56, фокус внутри,
 * Escape и «назад» закрывают, фон не прокручивается. Radix держит фокус и прокрутку,
 * «назад» ловится записью в истории, которую шторка ставит при открытии
 */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pushed = useRef(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!open) return;
    // Фон не прокручивается: Radix гасит колёсико, а html держим сами (раздел 5.1)
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    window.history.pushState({ ...window.history.state, siteMenu: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      setOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener("popstate", onPop);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    }
  };
  // Переход по пункту: запись меню в истории заменяется новой страницей, «назад» не нужен
  const leave = () => {
    pushed.current = false;
    setOpen(false);
  };
  useEffect(() => {
    pushed.current = false;
    setOpen(false);
  }, [pathname]);

  const row =
    "flex min-h-14 items-center justify-between gap-3 rounded-control px-1 text-body-strong text-text focus-ring";
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Меню"
          className="grid size-11 place-items-center rounded-full text-text focus-ring"
        >
          <Menu className="size-6" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="site-menu-sheet fixed inset-0 z-50 flex flex-col bg-void pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-text"
        >
          <div className="site-wrap flex h-14 shrink-0 items-center justify-between">
            <Dialog.Title className="text-title leading-none tracking-tight">
              {BRAND.mark}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="grid size-11 place-items-center rounded-full focus-ring"
              >
                <X className="size-6" aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <nav aria-label="Меню сайта" className="site-wrap flex flex-1 flex-col overflow-y-auto">
            <p className="site-caption mt-4 mb-1 text-text-3">{NAV.tasks}</p>
            <ul className="flex flex-col">
              {TASKS.map((task) => (
                <li key={task.key}>
                  <Link to={task.path} onClick={leave} className={row}>
                    {task.title}
                    <ArrowRight className="size-5 text-text-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-4 flex flex-col">
              <li>
                <Link to="/case/gas" onClick={leave} className={row}>
                  {NAV.caseLong}
                  <ArrowRight className="size-5 text-text-3" aria-hidden />
                </Link>
              </li>
              <li>
                <Link to="/demo" onClick={leave} className={row}>
                  {NAV.demo}
                  <ArrowRight className="size-5 text-text-3" aria-hidden />
                </Link>
              </li>
              <li>
                <a
                  href={contactTgUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("telegram_click", { place: "menu" })}
                  className={row}
                >
                  {NAV.telegram}
                  <ArrowUpRight className="size-5 text-text-3" aria-hidden />
                </a>
              </li>
            </ul>
            <div className="mt-auto py-6">
              <Link
                to="/razbor"
                onClick={() => {
                  leave();
                  track("cta_razbor", { place: "menu" });
                }}
                className={cn(siteButton.primary, "w-full")}
              >
                {NAV.primary}
              </Link>
            </div>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SiteFooter() {
  const link = "inline-flex min-h-11 items-center focus-ring is-hover:text-text";
  return (
    <footer className="site-footer bg-void">
      <div className="site-wrap grid gap-8 py-12 pb-[calc(48px+env(safe-area-inset-bottom))] text-meta text-text-2 md:grid-cols-[1fr_auto_auto] md:gap-16">
        <div className="flex flex-col gap-2">
          <p className="text-title leading-none tracking-tight text-text">{BRAND.mark}</p>
          <p>{BRAND.credit}</p>
          {LEGAL_LINE ? <p className="text-text-3">{LEGAL_LINE}</p> : null}
        </div>
        <nav aria-label={FOOTER.tasks}>
          <p className="mb-1 text-text-3">{FOOTER.tasks}</p>
          <ul className="flex flex-col">
            {TASKS.map((task) => (
              <li key={task.key}>
                <Link to={task.path} className={link}>
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={FOOTER.more}>
          <p className="mb-1 text-text-3">{FOOTER.more}</p>
          <ul className="flex flex-col">
            <li>
              <Link to="/case/gas" className={link}>
                {NAV.case}
              </Link>
            </li>
            <li>
              <Link to="/demo" className={link}>
                {NAV.demoShort}
              </Link>
            </li>
            <li>
              <Link to="/razbor" className={link}>
                {NAV.razborShort}
              </Link>
            </li>
            <li>
              <Link to="/privacy" className={link}>
                {NAV.privacy}
              </Link>
            </li>
            <li>
              <a
                href={contactTgUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("telegram_click", { place: "footer" })}
                className={link}
              >
                Telegram
              </a>
            </li>
          </ul>
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
