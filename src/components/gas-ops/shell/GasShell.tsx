/**
 * Рабочий контур газа (ADR-044, F1). На `/gas/*` вместо оболочки ГАЙКИ: своё меню, своя шапка,
 * своя нижняя панель по роли, без персон ГАЙКИ, выбора объектов и микрофона.
 *
 * Вид ADR-045 «Финальный интерфейс», раздел 4: телефон и планшет — шапка 52 + safe-area
 * без логотипа и стекла, заголовок экрана 24/30 в контенте уходит в шапку при прокрутке,
 * полоса показа под шапкой, плоская нижняя панель 56 из четырёх пунктов по роли. Компьютер
 * от 1024 — сайдбар 248 (сворачивается до 72, состояние запоминается) и шапка 56.
 * Бригадир видит экран бота во весь экран, без нижней панели.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  MoreHorizontal,
  RotateCcw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ROLE_LABEL, useGasActions, useGasActor, useGasHydration } from "@/api/gas-ops";
import { GAS_BRAND } from "@/lib/gas-ops/brand";
import {
  GAS_GROUP_LABEL,
  OUT_OF_SCOPE_LABEL,
  ROLE_TABS,
  gasScreen,
  gasScreenOf,
  roleInitial,
  screensFor,
  type GasGroup,
  type GasScreen,
} from "@/lib/gas-ops/screens";
import { resetGasShow } from "@/lib/gas-ops/show";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useBottomLayer } from "@/lib/ui/bottom-layers";
import { useCollapsingTitle } from "@/lib/ui/collapsing-title";
import { useSegScroll } from "@/lib/ui/seg-scroll";
import { useAppManifest, useInstallHint } from "@/lib/ui/pwa";
import { ListGroup, ListRow } from "@/components/ui/kit/list";
import { SCREEN_ICON } from "./icons";
import { RoleList } from "./RolePicker";
import { GasShowDock } from "../show/GasShowDock";

const GROUPS: readonly GasGroup[] = ["work", "catalogs", "growth", "help"];

function isActive(screen: GasScreen, pathname: string) {
  if (screen.to === "/gas") return pathname === "/gas" || pathname === "/gas/";
  return pathname === screen.to || pathname.startsWith(`${screen.to}/`);
}

export function GasShell({ children }: { children: ReactNode }) {
  // Введённые записи переживают перезагрузку: снимок поднимается после первой отрисовки
  useGasHydration();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const actor = useGasActor();
  const screen = gasScreenOf(pathname);
  useTourHighlight();
  // Бригадир живёт в боте: без нижней панели и без меню, как в мессенджере
  const botOnly = actor.role === "foreman" && screen.key === "foreman";

  const [rail, setRail] = useRail();
  useSegScroll(pathname);
  // На «Домой» контур ставится своим приложением «Учёт выработки» (4.20)
  useAppManifest("/manifest-gas.webmanifest", "Учёт выработки");
  useInstallHint();
  // Крупный заголовок в контенте; когда он ушёл под шапку, его текст встаёт в шапку (4.2)
  const { ref: titleRef, collapsed } = useCollapsingTitle(pathname);

  return (
    <div className="gas-shell flex min-h-dvh bg-void text-text">
      <GasSidebar pathname={pathname} rail={rail} onRail={setRail} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Шапка и полоса показа липкие вместе: полоса живёт под шапкой (4.4) */}
        <div className="sticky top-0 z-30">
          <GasTopbar screen={screen} collapsed={collapsed} />
          <GasShowDock />
        </div>
        <main
          id="gas-main"
          className={cn(
            "min-w-0 flex-1 px-gutter pt-2 lg:px-8 lg:pt-6",
            botOnly ? "pb-safe" : "pb-inset lg:pb-12",
          )}
        >
          <div className="mx-auto w-full max-w-[1280px]">
            {/* Заголовок экрана на телефоне и планшете: 24/30, отступ 8 сверху и 12 снизу */}
            {botOnly ? null : (
              <h1
                ref={titleRef}
                // Стартовый экран и финал показа рисуют свой крупный заголовок
                className={cn("mb-3 text-title lg:hidden", screen.key === "start" && "sr-only")}
              >
                {screen.title}
              </h1>
            )}
            {children}
          </div>
        </main>
      </div>
      {botOnly ? null : <GasBottomNav pathname={pathname} />}
    </div>
  );
}

/** Сайдбар компьютера свёрнут до рельса 72: запоминается, хранилище может быть недоступно */
function useRail(): [boolean, (next: boolean) => void] {
  const [rail, setRailState] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("neeklo-gas-sidebar-collapsed") === "1") setRailState(true);
    } catch {
      // приватный режим: сайдбар развёрнут
    }
  }, []);
  const setRail = useCallback((next: boolean) => {
    setRailState(next);
    try {
      localStorage.setItem("neeklo-gas-sidebar-collapsed", next ? "1" : "0");
    } catch {
      // приватный режим
    }
  }, []);
  return [rail, setRail];
}

/**
 * «Показать на экране» из инструкции (F2): адрес `?tour=цель` подсвечивает элемент
 * с `data-tour="цель"` на 4 секунды и прокручивает к нему. Элемент может появиться позже
 * первой отрисовки (данные, шторка), поэтому ждём его до 3 секунд.
 */
function useTourHighlight() {
  const tour = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>)["tour"],
  });
  useEffect(() => {
    if (typeof tour !== "string" || !tour) return;
    let element: Element | null = null;
    let done = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      element = document.querySelector(`[data-tour="${CSS.escape(tour)}"]`);
      if (!element && Date.now() - started < 3000) return;
      window.clearInterval(timer);
      if (!element || done) return;
      done = true;
      element.classList.add("guide-target");
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      window.setTimeout(() => element?.classList.remove("guide-target"), 4000);
    }, 120);
    return () => {
      window.clearInterval(timer);
      element?.classList.remove("guide-target");
    };
  }, [tour]);
}

/* ------------------------------------------------------------ Десктоп: сайдбар */

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-control bg-orange-strong text-body-strong text-on-orange",
        className,
      )}
    >
      г
    </span>
  );
}

function GasSidebar({
  pathname,
  rail,
  onRail,
}: {
  pathname: string;
  rail: boolean;
  onRail: (next: boolean) => void;
}) {
  const actor = useGasActor();
  const screens = screensFor(actor.role);
  return (
    <aside
      aria-label="Меню учёта выработки"
      data-rail={rail ? "true" : undefined}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 border-e border-line bg-base py-4 transition-[width] duration-150 ease-out lg:flex",
        rail ? "w-[72px] px-2" : "w-[248px] px-3",
      )}
    >
      {/* Логотип только здесь, в меню, и на стартовом экране (4.2) */}
      <Link
        to="/gas"
        title={GAS_BRAND.product}
        className={cn(
          "flex items-center gap-3 rounded-control py-1 focus-ring",
          rail ? "justify-center px-0" : "px-2",
        )}
      >
        <BrandMark />
        <span className={cn("min-w-0", rail && "sr-only")}>
          <span className="block truncate text-body-strong text-text">{GAS_BRAND.product}</span>
          <span className="block truncate text-meta text-text-3">{GAS_BRAND.clientShort}</span>
        </span>
      </Link>

      <nav
        aria-label="Разделы"
        className="nav-scroll -mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1"
      >
        {GROUPS.map((group) => {
          const items = screens.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-0.5">
              <p className={cn("px-3 pt-2 pb-1 text-meta text-text-3", rail && "sr-only")}>
                {GAS_GROUP_LABEL[group]}
                {group === "growth" ? (
                  <span className="ms-1.5 text-text-3">· {OUT_OF_SCOPE_LABEL}</span>
                ) : null}
              </p>
              {items.map((item) => {
                const Icon = SCREEN_ICON[item.key];
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    title={item.title}
                    data-active={isActive(item, pathname) ? "true" : undefined}
                    data-tour={`nav-${item.key}`}
                    className={cn("nav-item focus-ring", rail && "justify-center px-0")}
                  >
                    <Icon strokeWidth={1.75} aria-hidden />
                    <span className={cn("truncate", rail && "sr-only")}>{item.title}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2">
        {rail ? null : <RoleButton variant="wide" />}
        {rail ? null : (
          <div className="flex items-center gap-1">
            <ResetButton />
            <ThemeToggle className="ms-auto" />
          </div>
        )}
        <button
          type="button"
          onClick={() => onRail(!rail)}
          title={rail ? "Развернуть панель" : "Свернуть панель"}
          aria-label={rail ? "Развернуть панель" : "Свернуть панель"}
          aria-expanded={!rail}
          className={cn("nav-item focus-ring w-full text-left", rail && "justify-center px-0")}
        >
          {rail ? <ChevronsRight strokeWidth={1.75} /> : <ChevronsLeft strokeWidth={1.75} />}
          <span className={cn("truncate", rail && "sr-only")}>Свернуть панель</span>
        </button>
        {rail ? null : <p className="px-2 text-meta text-text-3">{GAS_BRAND.credit}</p>}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------ Шапка */

function GasTopbar({ screen, collapsed }: { screen: GasScreen; collapsed: boolean }) {
  return (
    <header data-collapsed={collapsed ? "true" : undefined} className="content-header lg:px-8">
      <div className="min-w-0 flex-1">
        {/* Телефон: период, а когда заголовок ушёл под шапку, его текст. Компьютер: заголовок */}
        <p className="truncate text-body-strong lg:hidden" aria-hidden={collapsed || undefined}>
          {collapsed ? screen.title : GAS_BRAND.periodLabel}
        </p>
        <h1 className="hidden truncate text-title lg:block">{screen.title}</h1>
      </div>
      <span className="hidden h-8 items-center rounded-full bg-surface-2 px-3 text-meta text-text-2 tnum lg:inline-flex">
        {GAS_BRAND.periodLabel}
      </span>
      {/* Свёрнутая полоса показа встаёт сюда таблеткой «4/6» */}
      <div id="gas-show-slot" className="contents" />
      <HeaderSearch />
      <HelpButton screen={screen} />
      <div className="lg:hidden">
        <RoleButton variant="avatar" />
      </div>
    </header>
  );
}

/** Поиск по записям: номер, объект, бригада. Ведёт в журнал с запросом */
function HeaderSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Поиск записи" className="icon-button focus-ring">
          <Search strokeWidth={1.6} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(360px,calc(100vw-32px))] rounded-[var(--r-lg)] p-3"
      >
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
            void navigate({ to: "/gas/entries", search: { q: text.trim() || undefined } });
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Номер, объект или бригада"
            aria-label="Что найти"
            className="h-12 min-w-0 flex-1 rounded-[var(--r-md)] bg-surface-2 px-3 text-[15px] text-text outline-none focus-ring"
          />
          <button type="submit" className="pill-action min-h-12 px-4 text-[14px] focus-ring">
            Найти
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** «?»: шаги экрана и переход в инструкцию */
function HelpButton({ screen }: { screen: GasScreen }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Что делать на этом экране"
          className="icon-button focus-ring"
        >
          <CircleHelp strokeWidth={1.6} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(340px,calc(100vw-32px))] rounded-[var(--r-lg)] p-4"
      >
        <p className="text-[13px] text-text-3">Что делать здесь</p>
        <ol className="mt-2 flex list-decimal flex-col gap-2 ps-5 text-[14px] leading-5 text-text">
          {screen.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Link
          to="/gas/guide"
          className="mt-3 inline-flex min-h-12 items-center text-[14px] font-medium text-orange focus-ring"
        >
          Открыть инструкцию
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** Кто я: на десктопе строка в сайдбаре, на телефоне аватар в шапке */
function RoleButton({ variant }: { variant: "wide" | "avatar" }) {
  const actor = useGasActor();
  const [open, setOpen] = useState(false);
  const label = `Вы: ${ROLE_LABEL[actor.role]}`;

  const trigger =
    variant === "wide" ? (
      <button
        type="button"
        data-tour="role"
        className="flex min-h-12 w-full items-center gap-3 rounded-[var(--r-md)] bg-surface px-3 py-2 text-left focus-ring press is-hover:bg-surface-2"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pill text-[13px] font-semibold text-pill-text">
          {roleInitial(actor.role)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-4 text-text-3">Вы смотрите как</span>
          <span className="block truncate text-[14px] leading-5 font-medium">
            {ROLE_LABEL[actor.role]}
          </span>
        </span>
      </button>
    ) : (
      <button
        type="button"
        aria-label={`${label}. Сменить роль`}
        data-tour="role"
        onClick={() => setOpen(true)}
        className="grid size-12 place-items-center rounded-full focus-ring press"
      >
        <span className="grid size-9 place-items-center rounded-full bg-pill text-[14px] font-semibold text-pill-text">
          {roleInitial(actor.role)}
        </span>
      </button>
    );

  if (variant === "avatar") {
    return (
      <>
        {trigger}
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title="Чьими глазами смотреть"
          description="Роль меняет меню и стартовый экран"
        >
          <RoleList onDone={() => setOpen(false)} />
        </BottomSheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-[340px] rounded-[var(--r-lg)] p-2">
        <p className="px-3 pt-2 pb-1 text-[13px] text-text-3">Чьими глазами смотреть</p>
        <RoleList onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** «Сбросить демо»: необратимо для введённого в этой вкладке, поэтому с подтверждением */
function ResetButton({ onDone, wide = false }: { onDone?: () => void; wide?: boolean }) {
  const actions = useGasActions();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-12 items-center gap-2 rounded-[var(--r-md)] px-3 text-[14px] text-text-2 focus-ring is-hover:bg-surface-2 is-hover:text-text",
          wide && "w-full",
        )}
      >
        <RotateCcw className="size-4" aria-hidden />
        Сбросить демо
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить демо?</AlertDialogTitle>
            <AlertDialogDescription>
              Записи, введённые в этой вкладке, и прогресс показа удалятся. Данные из отчёта
              заказчика останутся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Оставить</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void actions.reset().then(() => {
                  resetGasShow();
                  toast.success("Демо сброшено");
                  onDone?.();
                });
              }}
            >
              Сбросить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------ Телефон: нижняя панель */

function GasBottomNav({ pathname }: { pathname: string }) {
  const actor = useGasActor();
  const [more, setMore] = useState(false);
  const tabs = ROLE_TABS[actor.role].map(gasScreen);
  const rest = screensFor(actor.role).filter((s) => !tabs.includes(s));
  const moreActive = rest.some((s) => isActive(s, pathname));
  const ref = useRef<HTMLElement>(null);
  useBottomLayer("tabbar", ref);

  /*
   * Нижняя панель ADR-045, 4.3: плоская, на всю ширину, 56 + safe-area, граница сверху.
   * Активный пункт: иконка и подпись акцентом и точка 4 под подписью, без таблетки.
   */
  const item = (active: boolean) =>
    cn(
      "flex h-tabbar w-full flex-col items-center justify-center gap-1 pt-1 text-tab focus-ring",
      active ? "text-orange" : "text-text-2",
    );
  const dot = (active: boolean) => (
    <span
      aria-hidden
      className={cn("-mt-0.5 size-1 rounded-full", active ? "bg-orange" : "bg-transparent")}
    />
  );

  return (
    <>
      <nav
        ref={ref}
        aria-label="Основные разделы"
        className="line-top fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="flex items-stretch">
          {tabs.map((tab) => {
            const Icon = SCREEN_ICON[tab.key];
            const active = isActive(tab, pathname);
            return (
              <li key={tab.key} className="min-w-0 flex-1">
                <Link
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  data-tour={`tab-${tab.key}`}
                  className={item(active)}
                >
                  <Icon className="size-6" strokeWidth={active ? 2 : 1.75} aria-hidden />
                  <span className="max-w-full truncate px-1">{tab.short}</span>
                  {dot(active)}
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className={item(moreActive)}
            >
              <MoreHorizontal className="size-6" strokeWidth={1.75} aria-hidden />
              Ещё
              {dot(moreActive)}
            </button>
          </li>
        </ul>
      </nav>
      <BottomSheet
        open={more}
        onOpenChange={setMore}
        title="Ещё"
        description={`${GAS_BRAND.product} · ${GAS_BRAND.clientShort}`}
      >
        <MorePanel rest={rest} pathname={pathname} onDone={() => setMore(false)} />
      </BottomSheet>
    </>
  );
}

function MorePanel({
  rest,
  pathname,
  onDone,
}: {
  rest: GasScreen[];
  pathname: string;
  onDone: () => void;
}) {
  /* «Ещё» ADR-045, 5.17: группы строк 52, а не плитки */
  return (
    <div className="flex flex-col gap-section">
      {GROUPS.map((group) => {
        const items = rest.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <ListGroup
            key={group}
            title={`${GAS_GROUP_LABEL[group]}${group === "growth" ? ` · ${OUT_OF_SCOPE_LABEL}` : ""}`}
          >
            {items.map((item) => {
              const Icon = SCREEN_ICON[item.key];
              return (
                <li key={item.key}>
                  <ListRow
                    compact
                    leading={<Icon className="size-5" strokeWidth={1.75} aria-hidden />}
                    title={item.title}
                    current={isActive(item, pathname)}
                    renderLink={(props) => <Link to={item.to} onClick={onDone} {...props} />}
                  />
                </li>
              );
            })}
          </ListGroup>
        );
      })}
      <section>
        <p className="flex h-7 items-center text-meta text-text-3">Роль</p>
        <RoleList onDone={onDone} />
      </section>
      <div className="flex items-center gap-2">
        <ResetButton onDone={onDone} />
        <ThemeToggle className="ms-auto" />
      </div>
      <p className="text-meta text-text-3">{GAS_BRAND.credit}</p>
    </div>
  );
}
