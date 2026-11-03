/**
 * Рабочий контур газа (ADR-044, F1). На `/gas/*` вместо оболочки ГАЙКИ: своё меню, своя шапка,
 * своя нижняя панель по роли, без персон ГАЙКИ, выбора объектов и микрофона.
 *
 * Оболочка табеля по образцу ПТО Онлайн (ADR-061, разделы 3.1-3.3). Компьютер от 1024:
 * верхняя строка 56 (компания, модули, поиск, колокольчик, «?», профиль), закреплённое левое
 * меню 240 по роли со сворачиванием до 64, шапка экрана с крошками, заголовком, ⓘ, главной
 * кнопкой экрана и строкой счётчиков. До 1024: шапка 52, нижняя панель роли, меню из аватара.
 * Бригадир видит свою панель: «Сегодня», бот, «Мои записи», «Профиль».
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Info,
  LogOut,
  MessageSquareWarning,
  MoreHorizontal,
  RotateCcw,
  Search,
  UserRound,
  Signpost,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBack, useTabStack, type TabDef } from "@/lib/ui/tab-stack";
import { BottomSheet } from "@/components/common/BottomSheet";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BellButton,
  BrandTile,
  PhoneTabBar,
  type AttentionItem,
  type TabItem,
} from "@/components/shell/mono";
import {
  ROLE_LABEL,
  type Role,
  useGasActions,
  useGasActor,
  useGasAllowedObjects,
  useGasDirectory,
  useGasEmployees,
  useGasEntries,
  useGasEstimates,
  useGasHydration,
  useGasQueueCounts,
} from "@/api/gas-ops";
import { SearchField, SearchPalette } from "@/components/shell/SearchPalette";
import { buildGasIndex } from "@/lib/search/gas-index";
import type { SearchItem } from "@/lib/search";
import { useGasReviewPolicy, useGasWorkCost } from "@/api/gas-estimates";
import {
  contourOf,
  GasContourProvider,
  useGasBrand,
  useGasContour,
  type GasContourPayload,
} from "@/lib/gas-ops/contour";
import { setGasContour } from "@/lib/gas-ops/use-gas-ops";
import {
  FOREMAN_TAB_LABEL,
  GAS_NAV_LABEL,
  HELP_SCREENS,
  OUT_OF_SCOPE_LABEL,
  ROLE_HOME,
  ROLE_TABS,
  isFieldRole,
  gasScreen,
  gasScreenOf,
  navFor,
  roleInitial,
  screensFor,
  type GasNavSection,
  type GasScreen,
  type GasScreenKey,
} from "@/lib/gas-ops/screens";
import { clearInbox, linkButtons, messengerChannel, useGasInbox } from "@/api/gas-assistant";
import { clearScenario } from "@/lib/guide/store";
import { TOURS, getTourState, startTour, tourOfRole, tourSeen } from "@/lib/gas-ops/tour";
import { showDemoMarks } from "@/lib/cabinet";
import { useApp } from "@/lib/app-context";
import { gasOnlyEnabled } from "@/lib/gas-ops/gas-only";
import { resolveTheme, themeChoices, themeLabels } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useBottomLayer } from "@/lib/ui/bottom-layers";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSegScroll } from "@/lib/ui/seg-scroll";
import { useAppManifest, useInstallHint } from "@/lib/ui/pwa";
import { SCREEN_ICON } from "./icons";
import { RoleList } from "./RolePicker";
import { SCREEN_ACTIONS_ID, SCREEN_COUNTERS_ID } from "./screen-header";
import { AssistantButton } from "../assistant/AssistantPanel";
import { Tour } from "../tour/Tour";
import { ScreenStateGate } from "../ScreenStateGate";
import { OfflineBar } from "@/components/ui/kit/offline-bar";
import { useOffline } from "@/lib/ui/offline";

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
  // Введённые записи переживают перезагрузку: снимок поднимается после первой отрисовки
  useGasHydration();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const actor = useGasActor();
  const screen = gasScreenOf(pathname);
  useTourHighlight();
  useFirstTour(actor.role, screen.key);
  useOfflineShell();
  // Бот бригадира на телефоне во весь экран: шапка чата вместо шапки контура, без панели
  const botOnly = actor.role === "foreman" && screen.key === "foreman";
  const field = isFieldRole(actor.role);
  useSegScroll(pathname);
  // На «Домой» контур ставится своим приложением «Учёт выработки» (4.20)
  useAppManifest("/manifest-gas.webmanifest", "Учёт выработки");
  useInstallHint();
  const network = useOffline();
  // Высота липкого верха: экран бота занимает остаток высоты
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
    <div className="gas-shell min-h-dvh bg-canvas text-ink">
      <div ref={topRef} className="sticky top-0 z-30">
        <div className="max-lg:hidden">
          <GasTopBar />
        </div>
        {/* Экран бота на телефоне: шапка чата и есть шапка экрана, одна вместо двух (ADR-048) */}
        <div className={cn("lg:hidden", botOnly && "hidden")}>
          <GasPhoneHeader screen={screen} />
        </div>
        {network.offline ? <OfflineBar demo={network.simulated} /> : null}
      </div>
      <div className="lg:flex">
        {/* Левое меню только у ролей с меню: бригадир живёт в телефоне (таблица 3.3) */}
        {field ? null : <GasSideNav pathname={pathname} />}
        <main
          id="gas-main"
          className={cn("gas-content min-w-0 flex-1", botOnly ? "pb-safe" : "pb-inset lg:pb-12")}
        >
          {/* Бот на телефоне: шапка чата вместо шапки экрана */}
          <div className={screen.key === "foreman" ? "max-lg:hidden" : undefined}>
            <GasScreenHeader screen={screen} />
          </div>
          <div className="max-lg:pt-2">
            <ScreenStateGate screen={screen.key}>{children}</ScreenStateGate>
          </div>
        </main>
      </div>
      {botOnly ? null : <GasBottomNav pathname={pathname} />}
      {/* Помощник (4.8): у ролей с данными недели; бригадир и старт без него */}
      {field || screen.key === "start" ? null : <AssistantButton />}
      <Tour />
    </div>
  );
}

/**
 * Счётчики разделов левой панели: сколько ждёт решения человека. Ноль не показывается
 * (ADR-052): записи на проверке, сметы без подтверждения, записи для итоговой проверки.
 */
function useNavCounters(): Partial<Record<string, number>> {
  const counts = useGasQueueCounts();
  const policy = useGasReviewPolicy();
  const cost = useGasWorkCost();
  return {
    moderation: counts.pending,
    estimates: cost.versions.filter((v) => v.confirmedAt === null).length,
    reports: policy.finalList.length,
  };
}

/**
 * Оболочка бригадира без сети (ADR-062, F7): сервис `public/sw.js` держит «Сегодня»
 * и файлы сборки. Только в собранном приложении: в разработке файлы меняются на лету
 */
function useOfflineShell() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/gas/" }).catch(() => {
      // Браузер без сервиса или приватный режим: экран работает с сетью, как раньше
    });
  }, []);
}

/**
 * «Показать на экране» из инструкции (F2): адрес `?tour=цель` подсвечивает элемент
 * с `data-tour="цель"` на 4 секунды и прокручивает к нему. Элемент может появиться позже
 * первой отрисовки (данные, шторка), поэтому ждём его до 3 секунд.
 */
/**
 * Тур роли при первом входе (4.8): один раз на браузер, если другой тур не идёт. Только на
 * домашнем экране роли (F1): прямая ссылка на другой экран открывает этот экран без тура.
 * Автостарт никуда не переводит, первый шаг тура и стоит на домашнем экране
 */
function useFirstTour(role: Role, screenKey: GasScreenKey) {
  useEffect(() => {
    if (screenKey !== ROLE_HOME[role] || getTourState().tourId) return;
    const id = tourOfRole(role);
    // Администратор смотрит тур менеджера: его шаги на чужой роли, сам он не открывается
    if (id && !tourSeen(id) && TOURS[id].steps[0]?.role === role) startTour(id, { go: false });
  }, [role, screenKey]);
}

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

/** «Требует внимания» по роли: то же, что счётчики меню, одной строкой */
function useAttention(): AttentionItem[] {
  const actor = useGasActor();
  const counters = useNavCounters();
  const allowed = new Set(screensFor(actor.role).map((s) => s.key));
  const items: AttentionItem[] = [
    {
      key: "moderation",
      to: "/gas/moderation",
      text: `Записей ждут проверки: ${counters["moderation"] ?? 0}`,
      count: counters["moderation"] ?? 0,
    },
    {
      key: "estimates",
      to: "/gas/estimates",
      text: `Стоимость не подтверждена: ${counters["estimates"] ?? 0}`,
      count: counters["estimates"] ?? 0,
    },
    {
      key: "reports",
      to: "/gas/tabel",
      text: `К итоговой проверке: ${counters["reports"] ?? 0}`,
      count: counters["reports"] ?? 0,
    },
  ];
  return items.filter((item) => allowed.has(item.key as GasScreenKey));
}

/* ------------------------------------------------------------ Меню роли */

/** Меню роли с правами экранов и флагом газового контура (таблица 3.3) */
function useRoleNav(): GasNavSection[] {
  const actor = useGasActor();
  const contourKind = useGasContour().kind;
  return navFor(actor.role, contourKind);
}

/** Группа экрана в меню роли: для хлебных крошек */
function groupOf(screen: GasScreen, sections: readonly GasNavSection[]) {
  return sections.find((section) => section.items.includes(screen.key))?.group ?? null;
}

const NAV_COLLAPSED_KEY = "gaika-gas-nav-collapsed";

function readCollapsed() {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  } catch {
    // Приватный режим: меню раскрыто
    return false;
  }
}

/**
 * Левое меню компьютера (3.1): закреплено, группы с подписью, пункт 36 с иконкой 18
 * и счётчиком. Сворачивается до 64 с подсказками, состояние запоминается во вкладке
 */
function GasSideNav({ pathname }: { pathname: string }) {
  const sections = useRoleNav();
  const client = useGasContour().kind === "client";
  const counters = useNavCounters();
  const [collapsed, setCollapsed] = useState(false);
  // Состояние из хранилища после монтирования: сервер рисует раскрытое меню
  useEffect(() => setCollapsed(readCollapsed()), []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Приватный режим: состояние живёт до перезагрузки
    }
  };
  if (!sections.length) return null;
  return (
    <nav
      aria-label="Разделы"
      data-collapsed={collapsed ? "" : undefined}
      className="gas-sidenav max-lg:hidden"
    >
      {sections.map((section) => (
        <div key={section.group} className="flex flex-col gap-0.5">
          {collapsed ? (
            <span aria-hidden className="mx-2 mt-3 mb-1 border-t border-line first:mt-0" />
          ) : (
            <p className="gas-nav-label">{GAS_NAV_LABEL[section.group]}</p>
          )}
          {section.items.map((key) => {
            const screen = gasScreen(key);
            const Icon = SCREEN_ICON[key];
            const count = counters[key];
            const link = (
              <Link
                to={screen.to}
                aria-current={isActive(screen, pathname) ? "page" : undefined}
                aria-label={collapsed ? screen.title : undefined}
                data-tour={`nav-${key}`}
                className={cn("gas-nav-item focus-ring", collapsed && "justify-center px-0")}
              >
                <Icon strokeWidth={1.75} aria-hidden />
                {collapsed ? null : <span className="min-w-0 flex-1 truncate">{screen.title}</span>}
                {count && !collapsed ? (
                  <span className="type-small text-ink-3 tnum">
                    {count}
                    <span className="sr-only"> ждут решения</span>
                  </span>
                ) : null}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={key}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {screen.title}
                  {count ? ` · ${count}` : ""}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span key={key} className="contents">
                {link}
              </span>
            );
          })}
        </div>
      ))}
      {/* Граница договора газового заказчика один раз, в его личном контуре (D09, ADR-061) */}
      {client && !collapsed ? (
        <p className="mt-auto px-2.5 pt-4 type-small text-ink-3">
          Веб-кабинет · {OUT_OF_SCOPE_LABEL}
        </p>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        aria-expanded={!collapsed}
        className={cn(
          "gas-nav-item focus-ring",
          !(client && !collapsed) && "mt-auto",
          collapsed && "justify-center px-0",
        )}
      >
        {collapsed ? (
          <ChevronsRight strokeWidth={1.75} aria-hidden />
        ) : (
          <>
            <ChevronsLeft strokeWidth={1.75} aria-hidden />
            Свернуть
          </>
        )}
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------ Верхняя строка */

/**
 * Верхняя строка компьютера 56 (3.1): знак и компания с меню, модули по центру, справа поиск,
 * колокольчик, «?» и профиль. Снабжение и ПТО за флагом газового контура (ADR-061, решение 7)
 */
function GasTopBar() {
  const actor = useGasActor();
  const attention = useAttention();
  const inbox = useGasInbox(actor.id);
  const [searchOpen, setSearchOpen] = useState(false);
  useSearchHotkey(setSearchOpen);
  return (
    <header className="gas-topbar">
      <CompanyMenu />
      <ModulesNav />
      <div className="ml-auto flex items-center gap-1">
        <GasSearch open={searchOpen} onOpenChange={setSearchOpen} inline />
        {isFieldRole(actor.role) ? null : (
          <BellButton
            items={attention}
            messages={inbox.map((m) => ({
              key: m.key,
              text: m.text,
              links: linkButtons(m.buttons),
              note:
                messengerChannel === "demo" ? "Демо: показано здесь, в MAX не отправлено" : null,
            }))}
            allTo={gasScreen(ROLE_HOME[actor.role]).to}
            className="gas-icon-button bg-transparent shadow-none"
          />
        )}
        <HelpMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}

/** Знак и компания: меню компании (переключение организаций появится с сервером) */
function CompanyMenu() {
  const brand = useGasBrand();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${brand.clientShort}: меню компании`}
          className="flex min-h-10 shrink-0 items-center gap-2 rounded-control px-1.5 focus-ring is-hover:bg-panel-2"
        >
          <BrandTile className="size-8 rounded-control" />
          <span className="max-w-56 truncate type-label font-semibold">{brand.clientShort}</span>
          <ChevronDown className="size-4 text-ink-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-inset p-2 shadow-floating">
        <div className="px-3 pt-2 pb-2">
          <p className="type-label font-semibold">{brand.clientShort}</p>
          <p className="type-small text-ink-3">{brand.product}</p>
        </div>
        <div className="flex flex-col border-t border-line pt-1">
          <Link
            to="/gas"
            className="flex min-h-11 items-center gap-2 rounded-control px-3 type-text focus-ring is-hover:bg-panel-2"
          >
            На старт
          </Link>
          {showDemoMarks ? <ResetButton wide /> : null}
          <AboutSystem />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Модули по центру (3.1). Газовый заказчик видит только «Учёт времени»; без флага рядом
 * снабжение и ПТО, если у роли есть их экраны
 */
function ModulesNav() {
  const actor = useGasActor();
  const contourKind = useGasContour().kind;
  const allowed = new Set(screensFor(actor.role, contourKind).map((s) => s.key));
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const extra = gasOnlyEnabled()
    ? []
    : (
        [
          { key: "supply", label: "Снабжение", screens: ["supplyOverview", "supply"] },
          { key: "docs", label: "ПТО", screens: ["docsOverview", "docs"] },
        ] as const
      )
        .map((m) => ({ ...m, target: m.screens.find((key) => allowed.has(key)) }))
        .filter((m) => m.target !== undefined);
  const inModule = (keys: readonly GasScreenKey[]) =>
    keys.some((key) => pathname.startsWith(gasScreen(key).to));
  const otherActive = extra.some((m) => inModule(m.screens));
  return (
    <nav aria-label="Модули" className="flex min-w-0 items-center gap-1 pl-4">
      <Link
        to={gasScreen(ROLE_HOME[actor.role]).to}
        aria-current={otherActive ? undefined : "page"}
        className="gas-nav-item focus-ring"
      >
        Учёт времени
      </Link>
      {extra.map((m) => (
        <Link
          key={m.key}
          to={gasScreen(m.target!).to}
          aria-current={inModule(m.screens) ? "page" : undefined}
          className="gas-nav-item focus-ring"
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

/** ⌘K и Ctrl+K с любого экрана компьютера раскрывают поиск в шапке */
function useSearchHotkey(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setOpen]);
}

/**
 * Поиск контура (2.2): на компьютере иконка раскрывается в поле 360 в шапке, на телефоне
 * открывается окно. Индекс строится только при открытом поиске
 */
function GasSearch({
  open,
  onOpenChange,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inline?: boolean;
}) {
  const { themeChoice, setThemeChoice } = useApp();
  const index = useGasSearchIndex(open);
  const props = {
    open,
    onOpenChange,
    index,
    placeholder: "Запись, объект, бригада, человек, смета или действие",
    hint: "Попробуйте номер записи (42 найдёт ГЗ-00042), адрес объекта или имя бригады.",
    onAction: (action: string) => {
      if (action === "theme")
        setThemeChoice(resolveTheme(themeChoice) === "dark" ? "light" : "dark");
    },
  };
  return inline ? <SearchField {...props} /> : <SearchPalette {...props} />;
}

/** «?» (3.1): справка раздела, инструкция, вопросы заказчика и «Сообщить о проблеме» */
function HelpMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const screen = gasScreenOf(pathname);
  const actor = useGasActor();
  const contourKind = useGasContour().kind;
  const allowed = new Set(screensFor(actor.role, contourKind).map((s) => s.key));
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Справка" className="gas-icon-button focus-ring">
          <CircleHelp strokeWidth={1.75} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-inset p-2 shadow-floating">
        <div className="px-3 pt-2 pb-3">
          <HelpSteps screen={screen} />
        </div>
        <div className="flex flex-col border-t border-line pt-1">
          <TourButton onDone={() => setOpen(false)} />
          {HELP_SCREENS.filter((key) => allowed.has(key)).map((key) => {
            const help = gasScreen(key);
            const Icon = SCREEN_ICON[key];
            return (
              <Link
                key={key}
                to={help.to}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-2 rounded-control px-3 type-text focus-ring is-hover:bg-panel-2"
              >
                <Icon className="size-4 text-ink-3" aria-hidden />
                {help.title}
              </Link>
            );
          })}
          <ReportProblem screen={screen} onDone={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * «Сообщить о проблеме»: до сервера обращений копирует описание для мессенджера — экран,
 * роль, адрес и время. Отправки, которой нет, интерфейс не обещает (правило 3)
 */
function ReportProblem({ screen, onDone }: { screen: GasScreen; onDone?: () => void }) {
  const actor = useGasActor();
  const brand = useGasBrand();
  const copy = () => {
    const text = [
      `Проблема в «${brand.product}»`,
      `Экран: ${screen.title}`,
      `Роль: ${ROLE_LABEL[actor.role]}`,
      `Адрес: ${window.location.href}`,
      `Время: ${new Date().toLocaleString("ru-RU")}`,
      "Что случилось: ",
    ].join("\n");
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success("Описание скопировано: вставьте его в чат с менеджером проекта"))
      .catch(() => toast.error("Не удалось скопировать: опишите проблему менеджеру проекта"));
    onDone?.();
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex min-h-11 items-center gap-2 rounded-control px-3 text-left type-text focus-ring is-hover:bg-panel-2"
    >
      <MessageSquareWarning className="size-4 text-ink-3" aria-hidden />
      Сообщить о проблеме
    </button>
  );
}

/** «?»: шаги экрана и переход в инструкцию */
/** «Пройти тур» (4.8): тур своей роли с первого шага, из «?» и из профиля телефона */
function TourButton({ onDone }: { onDone: () => void }) {
  const actor = useGasActor();
  const id = tourOfRole(actor.role);
  if (!id) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onDone();
        startTour(id);
      }}
      className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left type-text focus-ring is-hover:bg-panel-2"
    >
      <Signpost className="size-4 text-ink-3" aria-hidden />
      Пройти тур: {TOURS[id].title.replace("Тур ", "")}
    </button>
  );
}

function HelpSteps({ screen }: { screen: GasScreen }) {
  return (
    <>
      <p className="type-label text-ink-3">{screen.title}: что делать здесь</p>
      <ol className="mt-2 flex list-decimal flex-col gap-2 ps-5 type-text text-ink">
        {screen.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </>
  );
}

/* ------------------------------------------------------------ Шапка экрана */

/**
 * Шапка экрана (3.1): хлебные крошки, заголовок 28 с ⓘ (справка раздела), справа место для
 * периода и одной главной кнопки экрана, ниже одна строка счётчиков без карточек.
 * Экран кладёт кнопку и свои счётчики через ScreenActions и ScreenCounters
 */
function GasScreenHeader({ screen }: { screen: GasScreen }) {
  const sections = useRoleNav();
  const group = groupOf(screen, sections);
  const actor = useGasActor();
  const brand = useGasBrand();
  const counts = useGasQueueCounts();
  const canReview = screensFor(actor.role).some((s) => s.key === "moderation");
  const status = [
    brand.periodLabel,
    canReview && counts.pending > 0 ? `${counts.pending} ждут проверки` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-1 pt-3 pb-4 lg:pt-5 lg:pb-5">
      <nav aria-label="Где вы" className="gas-crumbs max-lg:hidden">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>Учёт времени</li>
          {group ? (
            <>
              <li aria-hidden>→</li>
              <li>{GAS_NAV_LABEL[group]}</li>
            </>
          ) : null}
          <li aria-hidden>→</li>
          <li aria-current="page" className="text-ink-2">
            {screen.title}
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 max-lg:hidden">
          <h1 data-screen-title className="gas-title min-w-0 truncate">
            {screen.title}
          </h1>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Справка: ${screen.title}`}
                className="gas-icon-button size-8 focus-ring"
              >
                <Info className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 rounded-inset p-4 shadow-floating">
              <HelpSteps screen={screen} />
            </PopoverContent>
          </Popover>
        </div>
        <div id={SCREEN_ACTIONS_ID} className="flex flex-wrap items-center gap-2 empty:hidden" />
      </div>
      <div className="gas-counters-row gas-counters">
        <p className="gas-counters-default">{status}</p>
        <div id={SCREEN_COUNTERS_ID} className="gas-counters-custom" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Телефон: шапка */

/** Шапка телефона 52 (3.2): знак или «Назад», название экрана, поиск и аватар */
function GasPhoneHeader({ screen }: { screen: GasScreen }) {
  const actor = useGasActor();
  const [searchOpen, setSearchOpen] = useState(false);
  // Вложенный экран: не корень вкладки, не «Ещё» и не старт (ADR-048, 4)
  const roots = new Set<string>([...ROLE_TABS[actor.role], "more", "start", ROLE_HOME[actor.role]]);
  const nested = !roots.has(screen.key);
  const back = useBack(
    actor.role === "foreman" ? "/gas/brigade" : actor.role === "prorab" ? "/gas/site" : "/gas/more",
  );
  return (
    <header className="gas-phone-header">
      {nested ? (
        <button
          type="button"
          onClick={back}
          aria-label="Назад"
          className="-ml-2 grid size-11 place-items-center rounded-full text-ink focus-ring [touch-action:manipulation]"
        >
          <ChevronLeft className="size-6" strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <Link to="/gas" aria-label="На старт" className="shrink-0 rounded-control focus-ring">
          <BrandTile />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-heading">{screen.title}</h1>
      <button
        type="button"
        aria-label="Поиск"
        onClick={() => setSearchOpen(true)}
        className="gas-icon-button size-11 focus-ring"
      >
        <Search strokeWidth={1.75} aria-hidden />
      </button>
      <PhoneSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <ProfileMenu />
    </header>
  );
}

/** Окно поиска телефона: на компьютере поиск живёт в верхней строке */
function PhoneSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", false);
  if (desktop) return null;
  return <GasSearch open={open} onOpenChange={onOpenChange} />;
}

/* ------------------------------------------------------------ Профиль */

/** Аватар роли для шапки чата бота: то же меню, что в шапке контура */
export function GasRoleAvatar() {
  return <ProfileMenu />;
}

/**
 * Профиль (2.2): имя и аватар. Меню: кто вы, разделы роли (на телефоне это и есть левое меню,
 * 3.2), тема, «Сменить роль» в демо и «Выйти». На компьютере всплывающее меню, на телефоне
 * шторка
 */
function ProfileMenu() {
  const actor = useGasActor();
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)", false);
  const trigger = (
    <button
      type="button"
      aria-label={`Вы: ${ROLE_LABEL[actor.role]}. Сменить роль`}
      data-tour="role"
      onClick={desktop ? undefined : () => setOpen(true)}
      className="flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-pill focus-ring is-hover:bg-panel-2 lg:min-h-10 lg:pr-1 lg:pl-3"
    >
      <span className="hidden max-w-40 truncate type-label lg:block">{actor.name}</span>
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-full bg-panel-2 type-label font-semibold text-ink"
      >
        {roleInitial(actor.role)}
      </span>
    </button>
  );
  if (!desktop) {
    return (
      <>
        {trigger}
        <BottomSheet open={open} onOpenChange={setOpen} title={actor.name}>
          <ProfileBody onDone={() => setOpen(false)} withNav />
        </BottomSheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] rounded-inset p-2 shadow-floating">
        <ProfileBody onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function ProfileBody({ onDone, withNav = false }: { onDone: () => void; withNav?: boolean }) {
  const actor = useGasActor();
  const brand = useGasBrand();
  const { themeChoice, setThemeChoice } = useApp();
  const navigate = useNavigate();
  const sections = useRoleNav();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [roles, setRoles] = useState(false);
  const row =
    "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left type-text focus-ring is-hover:bg-panel-2";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 px-3 pt-2 pb-2">
        <UserRound className="size-5 text-ink-3" aria-hidden />
        <div className="min-w-0">
          <p className="truncate type-label font-semibold">{actor.name}</p>
          <p className="truncate type-small text-ink-3">
            {ROLE_LABEL[actor.role]} · {brand.clientShort}
          </p>
        </div>
      </div>
      {withNav && sections.length ? (
        <nav aria-label="Разделы" className="border-t border-line pt-1">
          {sections.map((section) => (
            <div key={section.group}>
              <p className="gas-nav-label">{GAS_NAV_LABEL[section.group]}</p>
              {section.items.map((key) => {
                const screen = gasScreen(key);
                const Icon = SCREEN_ICON[key];
                return (
                  <Link
                    key={key}
                    to={screen.to}
                    onClick={onDone}
                    aria-current={isActive(screen, pathname) ? "page" : undefined}
                    className={cn(
                      row,
                      "aria-[current=page]:bg-panel-2 aria-[current=page]:font-semibold",
                    )}
                  >
                    <Icon className="size-5 text-ink-3" strokeWidth={1.75} aria-hidden />
                    {screen.title}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      ) : null}
      {withNav ? (
        <div className="border-t border-line pt-1">
          <TourButton onDone={onDone} />
        </div>
      ) : null}
      <div className="border-t border-line px-3 pt-3 pb-1">
        <p className="mb-2 type-small text-ink-3">Тема</p>
        <div
          role="radiogroup"
          aria-label="Тема оформления"
          className="flex gap-1 rounded-pill bg-panel-2 p-1"
        >
          {themeChoices.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={themeChoice === choice}
              onClick={() => setThemeChoice(choice)}
              className={cn(
                "min-h-11 flex-1 rounded-pill px-2 type-label focus-ring",
                themeChoice === choice ? "bg-card shadow-surface" : "text-ink-2",
              )}
            >
              {themeLabels[choice]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col border-t border-line pt-1">
        <button
          type="button"
          aria-expanded={roles}
          onClick={() => setRoles((v) => !v)}
          className={row}
        >
          <RotateCcw className="size-4 text-ink-3" aria-hidden />
          <span className="flex-1">Сменить роль</span>
          <span className="type-small text-ink-3">демо</span>
        </button>
        {roles ? (
          <div className="px-1 pb-1">
            <RoleList onDone={onDone} />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            onDone();
            void navigate({ to: "/gas" });
          }}
          className={row}
        >
          <LogOut className="size-4 text-ink-3" aria-hidden />
          Выйти на старт
        </button>
      </div>
    </div>
  );
}

/** «О системе»: продукт и кто сделал, без ссылок наружу */
function AboutSystem() {
  const brand = useGasBrand();
  return (
    <details className="group rounded-control">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control px-3 type-text text-ink-2 focus-ring is-hover:bg-panel-2 [&::-webkit-details-marker]:hidden">
        <Info className="size-4" aria-hidden />О системе
      </summary>
      <div className="px-3 pb-2 type-small text-ink-2">
        <p>{brand.product}</p>
        <p>{brand.credit}</p>
      </div>
    </details>
  );
}

/**
 * Индекс поиска контура (ADR-055, 2.6): данные из портов контура, права роли режет
 * buildGasIndex. Бригадиру журнал только своей бригады, объекты только разрешённые
 */
function useGasSearchIndex(enabled: boolean): SearchItem[] {
  const actor = useGasActor();
  const contourKind = useGasContour().kind;
  const entries = useGasEntries({ ownBrigadeOnly: actor.role === "foreman" });
  const directory = useGasDirectory();
  const allowed = useGasAllowedObjects();
  const estimates = useGasEstimates();
  const people = useGasEmployees();
  return useMemo(() => {
    if (!enabled) return [];
    return buildGasIndex({
      role: actor.role,
      brigadeId: actor.brigadeId,
      canSeeMoney: actor.canSeeMoney,
      screens: new Set(screensFor(actor.role, contourKind).map((s) => s.key)),
      entries: entries.map((view) => ({
        id: view.entry.id,
        number: view.entry.number,
        day: view.entry.day,
        brigadeId: view.entry.brigadeId,
        brigadeName: view.brigade?.name ?? null,
        objectLabel: view.object?.label ?? null,
        objectCode: view.object?.code ?? null,
        amountRub: view.entry.amountRub,
      })),
      objects: directory.objects,
      allowedObjectIds: actor.role === "foreman" ? new Set(allowed.map((o) => o.id)) : null,
      brigades: directory.brigades.map((b) => ({
        id: b.id,
        name: b.name,
        note: b.leadName ? `бригадир ${b.leadName}` : null,
      })),
      estimates,
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        brigadeName: p.brigadeName,
        isLead: p.isLead,
      })),
    });
  }, [enabled, actor, contourKind, entries, directory, allowed, estimates, people]);
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
                  clearScenario();
                  clearInbox();
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

/**
 * Нижняя панель телефона по роли (3.2, 3.3): три раздела и «Ещё». У бригадира свои подписи
 * и «Профиль» вместо «Ещё»: смена роли, тема и сброс демо живут там же
 */
function GasBottomNav({ pathname }: { pathname: string }) {
  const actor = useGasActor();
  const foreman = actor.role === "foreman";
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

  // Нижняя панель «Монохрома» (2.5): 64 + safe-area, активный — чёрная таблетка за иконкой
  const items: TabItem[] = [
    ...tabs.map((tab) => ({
      key: tab.key,
      to: tab.to,
      label: (foreman ? FOREMAN_TAB_LABEL[tab.key] : undefined) ?? tab.short,
      icon: SCREEN_ICON[tab.key],
    })),
    foreman
      ? { key: GAS_MORE_TAB.key, to: GAS_MORE_TAB.root, label: "Профиль", icon: UserRound }
      : { key: GAS_MORE_TAB.key, to: GAS_MORE_TAB.root, label: "Ещё", icon: MoreHorizontal },
  ];
  // Прораб живёт в своём экране без панели
  if (!tabs.length) return null;
  return (
    <PhoneTabBar
      navRef={ref}
      items={items}
      activeKey={stack.active}
      onSelect={(item) => stack.select(defs.find((d) => d.key === item.key)!)}
      className="lg:hidden"
    />
  );
}

const GAS_MORE_TAB: TabDef = { key: "more", root: "/gas/more" };
/** Старт показа не вкладка: возврат на «Ещё» не должен вести на него */
const GAS_TRANSIENT = ["/gas", "/gas/"] as const;
