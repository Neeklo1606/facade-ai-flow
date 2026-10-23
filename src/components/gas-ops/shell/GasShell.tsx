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
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  MoreHorizontal,
  RotateCcw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBack, useTabStack, type TabDef } from "@/lib/ui/tab-stack";
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
import {
  contourOf,
  GasContourProvider,
  useGasBrand,
  useGasContour,
  type GasContourPayload,
} from "@/lib/gas-ops/contour";
import { setGasContour } from "@/lib/gas-ops/use-gas-ops";
import {
  GAS_GROUP_LABEL,
  OUT_OF_SCOPE_LABEL,
  ROLE_HOME,
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
import { useMediaQuery } from "@/hooks/use-media-query";
import { useCollapsingTitle } from "@/lib/ui/collapsing-title";
import { useSegScroll } from "@/lib/ui/seg-scroll";
import { useAppManifest, useInstallHint } from "@/lib/ui/pwa";
import { ListGroup, ListRow } from "@/components/ui/kit/list";
import { SCREEN_ICON } from "./icons";
import { RoleList } from "./RolePicker";
import { GasShowDock } from "../show/GasShowDock";
import { ScreenStateGate } from "../ScreenStateGate";
import { OfflineBar } from "@/components/ui/kit/offline-bar";
import { useOffline } from "@/lib/ui/offline";

export const GROUPS: readonly GasGroup[] = ["work", "catalogs", "growth", "help"];

export function isActive(screen: GasScreen, pathname: string) {
  if (screen.to === "/gas") return pathname === "/gas" || pathname === "/gas/";
  return pathname === screen.to || pathname.startsWith(`${screen.to}/`);
}

/**
 * Контур данных раздела (ADR-047): ответ загрузчика маршрута `/gas`. Оболочку рисует корень,
 * поэтому данные загрузчика берутся из совпадений маршрутов, а не из `Route.useLoaderData`
 */
export function GasShell({ children }: { children: ReactNode }) {
  const payload = useRouterState({
    select: (s) =>
      s.matches.find((match) => match.routeId === "/gas")?.loaderData as
        GasContourPayload | undefined,
  });
  const contour = useMemo(() => contourOf(payload), [payload]);
  // Контур вкладки ставится до экранов: они читают снимок своего контура с первого рендера
  setGasContour(contour);
  return (
    <GasContourProvider value={contour}>
      <GasShellFrame>{children}</GasShellFrame>
    </GasContourProvider>
  );
}

function GasShellFrame({ children }: { children: ReactNode }) {
  const brand = useGasBrand();
  // Введённые записи переживают перезагрузку: снимок поднимается после первой отрисовки
  useGasHydration();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const actor = useGasActor();
  const screen = gasScreenOf(pathname);
  useTourHighlight();
  // Бригадир живёт в боте: без нижней панели и без меню, как в мессенджере
  const botOnly = actor.role === "foreman" && screen.key === "foreman";

  const [railChoice, setRail] = useRail();
  // Планшет 768–1023: рельс 72 всегда (ADR-045, V7); с 1024 выбор человека
  const tablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  const rail = tablet || railChoice;
  useSegScroll(pathname);
  // На «Домой» контур ставится своим приложением «Учёт выработки» (4.20)
  useAppManifest("/manifest-gas.webmanifest", "Учёт выработки");
  useInstallHint();
  // Крупный заголовок в контенте; когда он ушёл под шапку, его текст встаёт в шапку (4.2)
  const { ref: titleRef, collapsed } = useCollapsingTitle(pathname);
  const network = useOffline();
  // Высота липкого верха (шапка и полоса показа): экран бота занимает остаток высоты
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = topRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () =>
      document.documentElement.style.setProperty("--gas-top-h", `${el.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="gas-shell flex min-h-dvh bg-void text-text">
      <GasSidebar pathname={pathname} rail={rail} onRail={setRail} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Шапка и полоса показа липкие вместе: полоса живёт под шапкой (4.4) */}
        <div ref={topRef} className="sticky top-0 z-30">
          {/* Экран бота на телефоне: шапка чата и есть шапка экрана, одна вместо трёх (ADR-048) */}
          <div className={screen.key === "foreman" ? "max-md:hidden" : undefined}>
            <GasTopbar screen={screen} collapsed={collapsed} />
          </div>
          {network.offline ? <OfflineBar demo={network.simulated} /> : null}
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
            {screen.key === "foreman" ? null : (
              <>
                <h1
                  ref={titleRef}
                  className={cn("text-title lg:hidden", screen.key === "more" ? "mb-3" : "mb-0.5")}
                >
                  {screen.title}
                </h1>
                {/* Период недели строкой мета под крупным заголовком (ADR-048, 5) */}
                {screen.key === "more" ? null : (
                  <p className="mb-3 text-meta text-text-2 tnum lg:hidden">{brand.periodLabel}</p>
                )}
              </>
            )}
            <ScreenStateGate screen={screen.key}>{children}</ScreenStateGate>
          </div>
        </main>
      </div>
      {/* Бригадир живёт в боте: панели нет ни в боте, ни в «Моих записях» (01_SPEC 4.3) */}
      {actor.role === "foreman" ? null : <GasBottomNav pathname={pathname} />}
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
  const brand = useGasBrand();
  const actor = useGasActor();
  const screens = screensFor(actor.role, useGasContour().kind);
  return (
    <aside
      aria-label="Меню учёта выработки"
      data-rail={rail ? "true" : undefined}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 border-e border-line bg-base py-4 transition-[width] duration-150 ease-out md:flex",
        rail ? "w-[72px] px-2" : "w-[248px] px-3",
      )}
    >
      {/* Логотип только здесь, в меню, и на стартовом экране (4.2) */}
      <Link
        to="/gas"
        title={brand.product}
        className={cn(
          "flex items-center gap-3 rounded-control py-1 focus-ring",
          rail ? "justify-center px-0" : "px-2",
        )}
      >
        <BrandMark />
        <span className={cn("min-w-0", rail && "sr-only")}>
          <span className="block truncate text-body-strong text-text">{brand.product}</span>
          <span className="block truncate text-meta text-text-3">{brand.clientShort}</span>
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
          className={cn(
            "nav-item focus-ring w-full text-left max-lg:hidden",
            rail && "justify-center px-0",
          )}
        >
          {rail ? <ChevronsRight strokeWidth={1.75} /> : <ChevronsLeft strokeWidth={1.75} />}
          <span className={cn("truncate", rail && "sr-only")}>Свернуть панель</span>
        </button>
        {rail ? null : <p className="px-2 text-meta text-text-3">{brand.credit}</p>}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------ Шапка */

function GasTopbar({ screen, collapsed }: { screen: GasScreen; collapsed: boolean }) {
  const brand = useGasBrand();
  const actor = useGasActor();
  // Вложенный экран: не корень вкладки, не «Ещё» и не старт показа (ADR-048, 4)
  const roots = new Set<string>([...ROLE_TABS[actor.role], "more", "start", ROLE_HOME[actor.role]]);
  const nested = !roots.has(screen.key);
  // Бригадиру «Назад» ведёт в бот: это его единственный корень
  const back = useBack(actor.role === "foreman" ? "/gas/foreman" : "/gas/more");
  return (
    <header data-collapsed={collapsed ? "true" : undefined} className="content-header lg:px-8">
      {nested ? (
        <button
          type="button"
          onClick={back}
          aria-label="Назад"
          className="-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-full pr-2 pl-1 text-body text-text focus-ring md:hidden [touch-action:manipulation]"
        >
          <ChevronLeft className="size-6" strokeWidth={1.75} aria-hidden />
          {collapsed ? null : "Назад"}
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        {/*
          Телефон (ADR-048, 5): заголовок встаёт в шапку, когда крупный ушёл под неё.
          Период живёт строкой мета под крупным заголовком. Компьютер: заголовок всегда
        */}
        <p className="truncate text-body-strong lg:hidden" aria-hidden={collapsed || undefined}>
          {collapsed ? screen.title : null}
        </p>
        <h1 className="hidden truncate text-title lg:block">{screen.title}</h1>
      </div>
      <span className="hidden h-8 items-center rounded-full bg-surface-2 px-3 text-meta text-text-2 tnum lg:inline-flex">
        {brand.periodLabel}
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
            className="text-body h-12 min-w-0 flex-1 rounded-[var(--r-md)] bg-surface-2 px-3 text-text outline-none focus-ring"
          />
          <button type="submit" className="text-body pill-action min-h-12 px-4 focus-ring">
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
        <p className="text-meta text-text-3">Что делать здесь</p>
        <ol className="text-body mt-2 flex list-decimal flex-col gap-2 ps-5 text-text">
          {screen.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Link
          to="/gas/guide"
          className="text-body-strong mt-3 inline-flex min-h-12 items-center font-medium text-orange focus-ring"
        >
          Открыть инструкцию
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** Аватар роли для шапки чата бота: та же шторка «Чьими глазами смотреть» */
export function GasRoleAvatar() {
  return <RoleButton variant="avatar" />;
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
        <span className="text-meta-strong grid size-8 shrink-0 place-items-center rounded-full bg-pill font-semibold text-pill-text">
          {roleInitial(actor.role)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-meta block text-text-3">Вы смотрите как</span>
          <span className="text-body-strong block truncate font-medium">
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
        <span className="text-body-strong grid size-9 place-items-center rounded-full bg-pill font-semibold text-pill-text">
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
        <p className="text-meta px-3 pt-2 pb-1 text-text-3">Чьими глазами смотреть</p>
        <RoleList onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** «Сбросить демо»: необратимо для введённого в этой вкладке, поэтому с подтверждением */
export function ResetButton({
  onDone,
  wide = false,
  row = false,
}: {
  onDone?: () => void;
  wide?: boolean;
  /** Строка экрана «Ещё»: высота 52, иконка 20, как соседние строки (ADR-048) */
  row?: boolean;
}) {
  const actions = useGasActions();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          row
            ? "flex min-h-row-compact w-full items-center gap-3 px-4 py-2.5 text-left text-body text-text transition-colors duration-100 focus-ring active:bg-surface-2 is-hover:bg-surface-2"
            : "inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-body text-text-2 focus-ring is-hover:bg-surface-2 is-hover:text-text",
          wide && "w-full",
        )}
      >
        <RotateCcw
          className={row ? "size-5 shrink-0 text-text-2" : "size-4"}
          strokeWidth={row ? 1.75 : 2}
          aria-hidden
        />
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
  const tabs = ROLE_TABS[actor.role].map(gasScreen);
  const ref = useRef<HTMLElement>(null);
  useBottomLayer("tabbar", ref);

  /*
   * Стек вкладок (ADR-048): «Ещё» это вкладка-экран, у каждой вкладки своя история, повторное
   * касание ведёт наверх и к корню. Экран вне вкладок принадлежит «Ещё»
   */
  const defs: TabDef[] = useMemo(
    () => [...tabs.map((tab) => ({ key: tab.key, root: tab.to })), GAS_MORE_TAB],
    [tabs],
  );
  const ownerOf = useCallback(
    (path: string) => tabs.find((tab) => isActive(tab, path))?.key ?? "more",
    [tabs],
  );
  const stack = useTabStack("gas", defs, ownerOf, GAS_TRANSIENT);

  /*
   * Нижняя панель ADR-045, 4.3: плоская, на всю ширину, 56 + safe-area, граница сверху.
   * Активный пункт: иконка и подпись акцентом и точка 4 под подписью, без таблетки.
   */
  const item = (active: boolean) =>
    cn(
      "flex h-tabbar w-full flex-col items-center justify-center gap-1 pt-1 text-tab focus-ring [touch-action:manipulation]",
      active ? "text-orange" : "text-text-2",
    );
  const dot = (active: boolean) => (
    <span
      aria-hidden
      className={cn("-mt-0.5 size-1 rounded-full", active ? "bg-orange" : "bg-transparent")}
    />
  );
  const entries = [
    ...tabs.map((tab) => ({
      def: { key: tab.key, root: tab.to },
      label: tab.short,
      icon: SCREEN_ICON[tab.key],
    })),
    { def: GAS_MORE_TAB, label: "Ещё", icon: MoreHorizontal },
  ];

  return (
    <nav
      ref={ref}
      aria-label="Основные разделы"
      className="line-top fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch">
        {entries.map(({ def, label, icon: Icon }) => {
          const active = stack.active === def.key;
          return (
            <li key={def.key} className="min-w-0 flex-1">
              <Link
                to={def.root}
                aria-current={active ? "page" : undefined}
                data-tour={`tab-${def.key}`}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                    return;
                  event.preventDefault();
                  stack.select(def);
                }}
                className={item(active)}
              >
                <Icon className="size-6" strokeWidth={active ? 2 : 1.75} aria-hidden />
                <span className="max-w-full truncate px-1">{label}</span>
                {dot(active)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const GAS_MORE_TAB: TabDef = { key: "more", root: "/gas/more" };
/** Старт показа не вкладка: возврат на «Ещё» не должен вести на него */
const GAS_TRANSIENT = ["/gas", "/gas/"] as const;
