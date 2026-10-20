/**
 * Рабочий контур газа (ADR-044, F1). На `/gas/*` вместо оболочки ГАЙКИ: своё меню, своя шапка,
 * своя нижняя панель по роли, без персон ГАЙКИ, выбора объектов и микрофона.
 *
 * Десктоп от 1024: сайдбар 248 px и шапка 64 px. Телефон и планшет: стеклянная шапка 56 px
 * и плавающая нижняя панель из четырёх пунктов. Бригадир видит экран бота во весь экран.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CircleHelp, MoreHorizontal, RotateCcw, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
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
  // Бригадир живёт в боте: без нижней панели и без меню, как в мессенджере
  const botOnly = actor.role === "foreman" && screen.key === "foreman";

  return (
    <div className="gas-shell flex min-h-dvh bg-void text-text">
      <GasSidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <GasTopbar screen={screen} />
        <main
          id="gas-main"
          className={cn(
            "min-w-0 flex-1 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6",
            botOnly ? "pb-safe" : "pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-12",
          )}
        >
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
      </div>
      {botOnly ? null : <GasBottomNav pathname={pathname} />}
      <GasShowDock lifted={!botOnly} />
    </div>
  );
}

/* ------------------------------------------------------------ Десктоп: сайдбар */

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[12px] bg-[radial-gradient(circle_at_30%_30%,#ff9a62,#f16001_55%,#8f1d0b)] text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(241,96,1,0.35)]",
        className,
      )}
    >
      г
    </span>
  );
}

function GasSidebar({ pathname }: { pathname: string }) {
  const actor = useGasActor();
  const screens = screensFor(actor.role);
  return (
    <aside
      aria-label="Меню учёта выработки"
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-4 bg-base px-3 py-4 lg:flex"
    >
      <Link
        to="/gas"
        className="flex items-center gap-3 rounded-[var(--r-md)] px-2 py-1 focus-ring"
      >
        <BrandMark />
        <span className="min-w-0">
          <span className="block truncate text-[14px] leading-5 font-semibold text-text">
            {GAS_BRAND.product}
          </span>
          <span className="block truncate text-[12px] leading-4 text-text-3">
            {GAS_BRAND.clientShort}
          </span>
        </span>
      </Link>

      <nav
        aria-label="Разделы"
        className="nav-scroll -mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1"
      >
        {GROUPS.map((group) => {
          const items = screens.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[12px] leading-4 text-text-3">
                {GAS_GROUP_LABEL[group]}
                {group === "growth" ? (
                  <span className="ms-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-3">
                    {OUT_OF_SCOPE_LABEL}
                  </span>
                ) : null}
              </p>
              {items.map((item) => {
                const Icon = SCREEN_ICON[item.key];
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    data-active={isActive(item, pathname) ? "true" : undefined}
                    data-tour={`nav-${item.key}`}
                    className="nav-item focus-ring"
                  >
                    <Icon strokeWidth={1.6} aria-hidden />
                    <span className="truncate">{item.title}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2">
        <RoleButton variant="wide" />
        <div className="flex items-center gap-1">
          <ResetButton />
          <ThemeToggle className="ms-auto" />
        </div>
        <p className="px-2 text-[11px] leading-4 text-text-3">{GAS_BRAND.credit}</p>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------ Шапка */

function GasTopbar({ screen }: { screen: GasScreen }) {
  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 px-4 sm:px-6 lg:static lg:h-16 lg:bg-transparent lg:px-8 lg:backdrop-blur-none">
      <Link
        to="/gas"
        aria-label="На главную учёта"
        className="shrink-0 rounded-[12px] focus-ring lg:hidden"
      >
        <BrandMark className="size-8 rounded-[10px] text-[13px]" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-[22px] lg:leading-7">
          {screen.title}
        </h1>
        <p className="truncate text-[12px] leading-4 text-text-3 lg:hidden">
          {GAS_BRAND.periodLabel}
        </p>
      </div>
      <span className="hidden h-9 items-center rounded-full bg-surface-2 px-3 text-[13px] text-text-2 tnum lg:inline-flex">
        {GAS_BRAND.periodLabel}
      </span>
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

  return (
    <>
      <nav
        aria-label="Основные разделы"
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden"
      >
        <ul className="glass mx-auto flex max-w-[520px] items-stretch gap-1 rounded-[28px] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
          {tabs.map((tab) => {
            const Icon = SCREEN_ICON[tab.key];
            const active = isActive(tab, pathname);
            return (
              <li key={tab.key} className="min-w-0 flex-1">
                <Link
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  data-tour={`tab-${tab.key}`}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] leading-4 font-medium focus-ring press",
                    active ? "bg-pill text-pill-text" : "text-text-2",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.7} aria-hidden />
                  <span className="max-w-full truncate px-1">{tab.short}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className={cn(
                "flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] leading-4 font-medium focus-ring press",
                moreActive ? "bg-pill text-pill-text" : "text-text-2",
              )}
            >
              <MoreHorizontal className="size-5" strokeWidth={1.7} aria-hidden />
              Ещё
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
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((group) => {
        const items = rest.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <p className="pb-1 text-[12px] text-text-3">
              {GAS_GROUP_LABEL[group]}
              {group === "growth" ? ` · ${OUT_OF_SCOPE_LABEL}` : ""}
            </p>
            <ul className="grid grid-cols-2 gap-2">
              {items.map((item) => {
                const Icon = SCREEN_ICON[item.key];
                return (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      onClick={onDone}
                      data-active={isActive(item, pathname) ? "true" : undefined}
                      className="flex min-h-[64px] flex-col justify-center gap-1 rounded-[var(--r-lg)] bg-surface-2 px-3 py-2 text-[14px] font-medium focus-ring press data-[active=true]:bg-pill data-[active=true]:text-pill-text"
                    >
                      <Icon className="size-5 opacity-80" strokeWidth={1.7} aria-hidden />
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <section>
        <p className="pb-1 text-[12px] text-text-3">Роль</p>
        <RoleList onDone={onDone} />
      </section>
      <div className="flex items-center gap-2">
        <ResetButton onDone={onDone} />
        <ThemeToggle className="ms-auto" />
      </div>
      <p className="text-[12px] text-text-3">{GAS_BRAND.credit}</p>
    </div>
  );
}
