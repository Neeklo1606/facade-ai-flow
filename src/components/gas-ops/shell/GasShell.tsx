/**
 * Рабочий контур газа (ADR-044, F1). На `/gas/*` вместо оболочки ГАЙКИ: своё меню, своя шапка,
 * своя нижняя панель по роли, без персон ГАЙКИ, выбора объектов и микрофона.
 *
 * Вид «Монохром» (ADR-055, разделы 2.1, 2.4, 2.5). Компьютер от 1024: верхняя строка 72
 * на холсте (знак и компания, меню-таблетка роли, колокольчик, аватар), плавающая капсула
 * слева (поиск, модули, справка, тема), заголовок экрана 44/48 со статус-плашкой. До 1024:
 * шапка 56 со знаком, названием экрана, поиском и колокольчиком, нижняя панель 64 из четырёх
 * пунктов роли и «Ещё». Бригадир видит экран бота во весь экран, без нижней панели.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronLeft,
  CircleHelp,
  Info,
  LayoutGrid,
  Moon,
  MoreHorizontal,
  RotateCcw,
  Search,
  Sun,
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
import {
  BellButton,
  BrandTile,
  FloatingCapsule,
  PhoneTabBar,
  PillMenu,
  ScreenTitle,
  type AttentionItem,
  type CapsuleAction,
  type MenuItem,
  type MenuSection,
  type TabItem,
} from "@/components/shell/mono";
import {
  ROLE_LABEL,
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
import { SearchPalette } from "@/components/shell/SearchPalette";
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
  GAS_GROUP_LABEL,
  OUT_OF_SCOPE_LABEL,
  ROLE_HOME,
  ROLE_MENU,
  ROLE_TABS,
  isFieldRole,
  gasScreen,
  gasScreenOf,
  roleInitial,
  screensFor,
  type GasGroup,
  type GasScreen,
  type GasScreenKey,
} from "@/lib/gas-ops/screens";
import { resetGasShow } from "@/lib/gas-ops/show";
import { useApp } from "@/lib/app-context";
import { legacyModulesEnabled } from "@/lib/legacy-modules";
import { resolveTheme, themeChoices, themeLabels } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useBottomLayer } from "@/lib/ui/bottom-layers";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSegScroll } from "@/lib/ui/seg-scroll";
import { useAppManifest, useInstallHint } from "@/lib/ui/pwa";
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
  useSegScroll(pathname);
  // На «Домой» контур ставится своим приложением «Учёт выработки» (4.20)
  useAppManifest("/manifest-gas.webmanifest", "Учёт выработки");
  useInstallHint();
  const network = useOffline();
  const counts = useGasQueueCounts();
  const canReview = screensFor(actor.role).some((s) => s.key === "moderation");
  // Статус-плашка экрана (2.1): сколько ждёт проверки, иначе период недели
  const status =
    canReview && counts.pending > 0 ? `${counts.pending} ждут проверки` : brand.periodLabel;
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
    <div className="gas-shell min-h-dvh bg-canvas text-ink">
      {/* Шапка и полоса показа липкие вместе на телефоне: полоса живёт под шапкой (4.4) */}
      <div ref={topRef} className="sticky top-0 z-30 bg-canvas lg:static">
        {/* Экран бота на телефоне: шапка чата и есть шапка экрана, одна вместо двух (ADR-048) */}
        <div className={screen.key === "foreman" ? "max-lg:hidden" : undefined}>
          <GasHeader screen={screen} />
        </div>
        {network.offline ? <OfflineBar demo={network.simulated} /> : null}
        <GasShowDock />
      </div>
      {isFieldRole(actor.role) ? null : <GasCapsule screen={screen} />}
      <main
        id="gas-main"
        className={cn("mono-content min-w-0", botOnly ? "pb-safe" : "pb-inset lg:pb-12")}
      >
        {/* Заголовок экрана компьютера; у бота на телефоне заголовок — шапка чата */}
        <div className="max-lg:hidden">
          <ScreenTitle
            title={screen.title}
            status={screen.key === "more" || screen.key === "foreman" ? null : status}
          />
        </div>
        <div className="max-lg:pt-2">
          <ScreenStateGate screen={screen.key}>{children}</ScreenStateGate>
        </div>
      </main>
      {/* Бригадир живёт в боте: панели нет ни в боте, ни в «Моих записях» (01_SPEC 4.3) */}
      {isFieldRole(actor.role) ? null : <GasBottomNav pathname={pathname} />}
    </div>
  );
}

/** Событие «открыть поиск»: его шлёт кнопка левой панели, слушает поиск в шапке */
const SEARCH_EVENT = "gas-search-open";

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

/* ------------------------------------------------------------ Шапка */

/**
 * Меню роли со счётчиками: что ждёт решения (ADR-052), ноль не показывается. Остальные
 * разделы роли — в «Ещё» группами; граница договора подписана у группы «Развитие» (L3)
 */
function useRoleMenu(): { items: MenuItem[]; more: MenuSection[] } {
  const actor = useGasActor();
  const contourKind = useGasContour().kind;
  const counters = useNavCounters();
  const screens = screensFor(actor.role, contourKind);
  const allowed = new Set(screens.map((s) => s.key));
  const main = ROLE_MENU[actor.role].filter((key) => allowed.has(key));
  const item = (screen: GasScreen): MenuItem => ({
    key: screen.key,
    to: screen.to,
    label: screen.title,
    count: counters[screen.key],
  });
  const rest = screens.filter((s) => s.key !== "start" && !main.includes(s.key));
  return {
    items: main.map((key) => item(gasScreen(key))),
    more: GROUPS.map((group) => ({
      title: `${GAS_GROUP_LABEL[group]}${group === "growth" && contourKind === "client" ? ` · ${OUT_OF_SCOPE_LABEL}` : ""}`,
      items: rest.filter((s) => s.group === group).map(item),
    })),
  };
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
      to: "/gas/reports",
      text: `К итоговой проверке: ${counters["reports"] ?? 0}`,
      count: counters["reports"] ?? 0,
    },
  ];
  return items.filter((item) => allowed.has(item.key as GasScreenKey));
}

/**
 * Шапка контура. Компьютер: знак и компания, меню-таблетка по центру, колокольчик и аватар.
 * Телефон: знак, название экрана, поиск, колокольчик и аватар роли
 */
function GasHeader({ screen }: { screen: GasScreen }) {
  const brand = useGasBrand();
  const actor = useGasActor();
  const { items: menu, more } = useRoleMenu();
  const attention = useAttention();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = [...menu, ...more.flatMap((section) => section.items)].find((item) =>
    isActive(gasScreen(item.key as GasScreenKey), pathname),
  );
  // Вложенный экран: не корень вкладки, не «Ещё» и не старт показа (ADR-048, 4)
  const roots = new Set<string>([...ROLE_TABS[actor.role], "more", "start", ROLE_HOME[actor.role]]);
  const nested = !roots.has(screen.key);
  // Бригадиру «Назад» ведёт в бот: это его единственный корень
  const back = useBack(
    actor.role === "foreman" ? "/gas/foreman" : actor.role === "prorab" ? "/gas/site" : "/gas/more",
  );
  return (
    <header className="shell-header mono-phone-header lg:mono-topbar lg:static lg:bg-transparent">
      {nested ? (
        <button
          type="button"
          onClick={back}
          aria-label="Назад"
          className="-ml-2 grid size-11 place-items-center rounded-full text-ink focus-ring lg:hidden [touch-action:manipulation]"
        >
          <ChevronLeft className="size-6" strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
      <Link
        to="/gas"
        title={brand.product}
        aria-label={`${brand.product}, на старт`}
        className={cn(
          "flex shrink-0 items-center gap-3 rounded-tile focus-ring",
          nested && "max-lg:hidden",
        )}
      >
        <BrandTile />
        <span className="hidden min-w-0 type-card lg:block">{brand.clientShort}</span>
      </Link>
      {/* Телефон: название экрана 17/600 в шапке */}
      <h1 className="min-w-0 flex-1 truncate text-heading lg:hidden">{screen.title}</h1>
      <div className="hidden min-w-0 flex-1 justify-center lg:flex">
        {menu.length ? <PillMenu items={menu} more={more} activeKey={active?.key ?? null} /> : null}
      </div>
      {/* Свёрнутая полоса показа встаёт сюда таблеткой «4/6» */}
      <div id="gas-show-slot" className="contents" />
      <div className="lg:hidden">
        <HeaderSearch />
      </div>
      {isFieldRole(actor.role) ? null : (
        <BellButton items={attention} allTo={gasScreen(ROLE_HOME[actor.role]).to} />
      )}
      <AvatarMenu />
    </header>
  );
}

/**
 * Плавающая капсула слева (2.1): поиск, модули, справка и тема. Модули — другие контуры:
 * полевой контур ГАЙКИ всегда, снабжение и документы — когда их экраны включены (ADR-038)
 */
function GasCapsule({ screen }: { screen: GasScreen }) {
  const { themeChoice, setThemeChoice } = useApp();
  const dark = resolveTheme(themeChoice) === "dark";
  const actions: (CapsuleAction | null)[] = [
    {
      key: "search",
      label: "Поиск, ⌘K",
      icon: Search,
      onClick: () => window.dispatchEvent(new Event(SEARCH_EVENT)),
    },
    {
      key: "modules",
      label: "Модули",
      icon: LayoutGrid,
      render: (trigger) => (
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            side="right"
            align="center"
            sideOffset={16}
            className="w-72 rounded-inset p-2 shadow-floating"
          >
            <ModulesList />
          </PopoverContent>
        </Popover>
      ),
    },
    null,
    {
      key: "help",
      label: "Что делать на этом экране",
      icon: CircleHelp,
      render: (trigger) => (
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            side="right"
            align="center"
            sideOffset={16}
            className="w-80 rounded-inset p-4 shadow-floating"
          >
            <HelpSteps screen={screen} />
          </PopoverContent>
        </Popover>
      ),
    },
    null,
    {
      key: "theme",
      label: dark ? "Светлая тема" : "Тёмная тема",
      icon: dark ? Sun : Moon,
      onClick: () => setThemeChoice(dark ? "light" : "dark"),
    },
  ];
  return <FloatingCapsule actions={actions} />;
}

/** Контуры продукта: где человек сейчас и куда можно перейти */
function ModulesList() {
  const legacy = legacyModulesEnabled();
  const modules = [
    { key: "gas", to: "/gas", label: "Учёт времени бригад", note: "Этот контур", current: true },
    {
      key: "field",
      to: "/today",
      label: "Голос с объекта",
      note: "Полевой контур ГАЙКИ",
      current: false,
    },
    ...(legacy
      ? [
          {
            key: "supply",
            to: "/inbox",
            label: "Снабжение",
            note: "Заявки и поставки",
            current: false,
          },
          { key: "docs", to: "/projects", label: "Документы", note: "По объектам", current: false },
        ]
      : []),
  ];
  return (
    <>
      <p className="px-3 pt-2 pb-1 type-label text-ink-3">Модули</p>
      <ul className="flex flex-col">
        {modules.map((m) => (
          <li key={m.key}>
            <Link
              to={m.to}
              aria-current={m.current ? "page" : undefined}
              className="flex min-h-12 flex-col justify-center rounded-tile px-3 py-2 focus-ring is-hover:bg-panel-2 aria-[current=page]:bg-panel-2"
            >
              <span className="type-text font-medium">{m.label}</span>
              <span className="type-small text-ink-3">{m.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
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

/**
 * Палитра поиска контура. Открывают капсула, кнопка шапки телефона и ⌘K / Ctrl K
 * с любого экрана
 */
function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const { themeChoice, setThemeChoice } = useApp();
  const index = useGasSearchIndex(open);
  useEffect(() => {
    const show = () => setOpen(true);
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(SEARCH_EVENT, show);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener(SEARCH_EVENT, show);
      window.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <>
      <button
        type="button"
        aria-label="Поиск"
        onClick={() => setOpen(true)}
        className="mono-circle focus-ring lg:hidden"
      >
        <Search strokeWidth={1.75} aria-hidden />
      </button>
      <SearchPalette
        open={open}
        onOpenChange={setOpen}
        index={index}
        placeholder="Номер записи, объект, бригада, человек или действие"
        hint="Попробуйте номер записи (42 найдёт ГЗ-00042), адрес объекта или имя бригады."
        onAction={(action) => {
          if (action === "theme")
            setThemeChoice(resolveTheme(themeChoice) === "dark" ? "light" : "dark");
        }}
      />
    </>
  );
}

/** «?»: шаги экрана и переход в инструкцию */
function HelpSteps({ screen }: { screen: GasScreen }) {
  return (
    <>
      <p className="type-label text-ink-3">Что делать здесь</p>
      <ol className="mt-2 flex list-decimal flex-col gap-2 ps-5 type-text text-ink">
        {screen.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Link
        to="/gas/guide"
        className="mt-3 inline-flex min-h-12 items-center type-text font-medium underline underline-offset-4 focus-ring"
      >
        Открыть инструкцию
      </Link>
    </>
  );
}

/** Аватар роли для шапки чата бота: то же меню, что в шапке контура */
export function GasRoleAvatar() {
  return <AvatarMenu />;
}

/**
 * Аватар и его меню (2.1): роль демо, компания, тема, «Сбросить демо», «О системе».
 * На компьютере — всплывающее меню, на телефоне — шторка
 */
function AvatarMenu() {
  const actor = useGasActor();
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)", false);
  const trigger = (
    <button
      type="button"
      aria-label={`Вы: ${ROLE_LABEL[actor.role]}. Сменить роль`}
      data-tour="role"
      onClick={desktop ? undefined : () => setOpen(true)}
      className="mono-circle focus-ring press"
    >
      <span aria-hidden className="type-label font-semibold">
        {roleInitial(actor.role)}
      </span>
    </button>
  );
  const body = <AvatarMenuBody onDone={() => setOpen(false)} />;
  if (!desktop) {
    return (
      <>
        {trigger}
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title="Вы смотрите как"
          description="Роль меняет меню и стартовый экран"
        >
          {body}
        </BottomSheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] rounded-inset p-2 shadow-floating">
        <p className="px-3 pt-2 pb-1 type-label text-ink-3">Вы смотрите как</p>
        {body}
      </PopoverContent>
    </Popover>
  );
}

function AvatarMenuBody({ onDone }: { onDone: () => void }) {
  const brand = useGasBrand();
  const { themeChoice, setThemeChoice } = useApp();
  return (
    <div className="flex flex-col gap-2">
      <RoleList onDone={onDone} />
      <div className="border-t border-line px-3 pt-3">
        <p className="type-small text-ink-3">Компания</p>
        <p className="type-text">{brand.clientShort}</p>
      </div>
      <div className="px-3 pt-1">
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
        <ResetButton wide onDone={onDone} />
        <AboutSystem />
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

  // Нижняя панель «Монохрома» (2.5): 64 + safe-area, активный — чёрная таблетка за иконкой
  const items: TabItem[] = [
    ...tabs.map((tab) => ({
      key: tab.key,
      to: tab.to,
      label: tab.short,
      icon: SCREEN_ICON[tab.key],
    })),
    { key: GAS_MORE_TAB.key, to: GAS_MORE_TAB.root, label: "Ещё", icon: MoreHorizontal },
  ];
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
