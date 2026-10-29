/**
 * Детали оболочки «Монохром» (ADR-055, разделы 2.1, 2.4, 2.5): знак, меню-таблетка
 * с переезжающим индикатором, круги шапки, колокольчик «Требует внимания», плавающая
 * капсула слева, нижняя панель телефона и заголовок экрана со статус-плашкой.
 *
 * Детали не знают про контуры: пункты, счётчики и действия им передаёт оболочка контура
 * (газ, ГАЙКА, кабинет). Размеры живут в утилитах mono-* в styles.css.
 */
import { Link } from "@tanstack/react-router";
import { Bell, MoreHorizontal, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface MenuItem {
  key: string;
  to: string;
  label: string;
  /** Сколько ждёт решения; ноль не показывается */
  count?: number | undefined;
  icon?: LucideIcon;
}

/** Знак: чёрная плитка с белой «г». Оранжевый только у знака на лендинге */
export function BrandTile({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("mono-brand", className)}>
      г
    </span>
  );
}

export interface MenuSection {
  title: string;
  items: readonly MenuItem[];
}

/**
 * Меню-таблетка роли. Активный пункт — чёрная таблетка, индикатор переезжает между пунктами.
 * «Ещё» держит остальные разделы роли группами; на 1024–1279 туда же уходят пункты после
 * четвёртого.
 */
export function PillMenu({
  items,
  more = [],
  activeKey,
  label = "Разделы",
}: {
  items: readonly MenuItem[];
  more?: readonly MenuSection[];
  activeKey: string | null;
  label?: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      // Активный пункт может быть спрятан в «Ещё» на узком экране: тогда индикатор на «Ещё»
      const candidates = nav.querySelectorAll<HTMLElement>("[data-pill-target]");
      const target = [...candidates].find((el) => el.offsetParent !== null);
      setBox(target ? { left: target.offsetLeft, width: target.offsetWidth } : null);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeKey, items]);

  const overflow = items.slice(4);
  const sections = more.filter((section) => section.items.length > 0);
  const moreActive = [...overflow, ...sections.flatMap((section) => section.items)].some(
    (item) => item.key === activeKey,
  );
  // Без своих разделов «Ещё» нужно только на узком экране, когда пункты не помещаются
  const moreClass = sections.length ? undefined : "xl:hidden";
  const row = (item: MenuItem, extra?: string) => (
    <li key={item.key} className={extra}>
      <Link
        to={item.to}
        aria-current={item.key === activeKey ? "page" : undefined}
        className="flex min-h-11 items-center justify-between gap-3 rounded-tile px-3 type-text focus-ring is-hover:bg-panel-2 aria-[current=page]:bg-panel-2"
      >
        {item.label}
        {item.count ? <span className="text-ink-3 tnum">{item.count}</span> : null}
      </Link>
    </li>
  );

  return (
    <nav ref={navRef} aria-label={label} className="mono-pill">
      {box ? (
        <span
          aria-hidden
          className="mono-pill-indicator slide-indicator"
          style={{ transform: `translateX(${box.left}px)`, width: box.width }}
        />
      ) : null}
      {items.map((item, index) => {
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            to={item.to}
            aria-current={active ? "page" : undefined}
            data-active={active ? "" : undefined}
            data-pill-target={active ? "" : undefined}
            data-tour={`nav-${item.key}`}
            className={cn("mono-pill-item focus-ring", index >= 4 && "hidden xl:inline-flex")}
          >
            {item.label}
            {item.count ? (
              <span className="mono-pill-count">
                {item.count}
                <span className="sr-only"> ждут решения</span>
              </span>
            ) : null}
          </Link>
        );
      })}
      {overflow.length || sections.length ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-active={moreActive ? "" : undefined}
              data-pill-target={moreActive ? "" : undefined}
              className={cn("mono-pill-item focus-ring", moreClass)}
            >
              Ещё
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            aria-label="Остальные разделы"
            className="w-64 rounded-inset p-2 shadow-floating"
          >
            {overflow.length ? (
              <ul className="flex flex-col gap-1 xl:hidden">{overflow.map((item) => row(item))}</ul>
            ) : null}
            {sections.map((section) => (
              <div key={section.title} className="mt-1 first:mt-0">
                <p className="px-3 pt-2 pb-1 type-small text-ink-3">{section.title}</p>
                <ul className="flex flex-col gap-1">{section.items.map((item) => row(item))}</ul>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </nav>
  );
}

export interface AttentionItem {
  key: string;
  to: string;
  /** Одна строка: «6 записей ждут проверки» */
  text: string;
  count: number;
}

/** Колокольчик: что требует внимания роли, до пяти пунктов и ссылка «Все» */
export function BellButton({
  items,
  allTo,
  className,
}: {
  items: readonly AttentionItem[];
  allTo: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = items.filter((item) => item.count > 0).slice(0, 5);
  const fresh = shown.length > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={fresh ? `Требует внимания: ${shown.length}` : "Требует внимания: ничего"}
          className={cn("mono-circle focus-ring", className)}
        >
          <Bell strokeWidth={1.75} aria-hidden />
          {fresh ? <span aria-hidden className="mono-dot" /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-inset p-2 shadow-floating">
        <p className="px-3 pt-2 pb-1 type-label text-ink-3">Требует внимания</p>
        {fresh ? (
          <ul className="flex flex-col">
            {shown.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-tile px-3 py-2 type-text focus-ring is-hover:bg-panel-2"
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-ink" />
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 type-text text-ink-2">Сейчас ничего не ждёт решения.</p>
        )}
        <Link
          to={allTo}
          onClick={() => setOpen(false)}
          className="mt-1 flex min-h-11 items-center rounded-tile px-3 type-label focus-ring is-hover:bg-panel-2"
        >
          Все
        </Link>
      </PopoverContent>
    </Popover>
  );
}

export interface CapsuleAction {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Кнопка действия; для всплывающего содержимого — render */
  onClick?: () => void;
  /** Своя кнопка (меню, поповер): получает класс и подпись */
  render?: (button: ReactNode) => ReactNode;
  badge?: number | undefined;
  active?: boolean;
}

/**
 * Плавающая капсула слева (2.1): поиск, модули, настройки, справка, ассистент, тема.
 * Подпись справа при наведении и фокусе. null в списке — разделитель.
 */
export function FloatingCapsule({ actions }: { actions: readonly (CapsuleAction | null)[] }) {
  return (
    <aside aria-label="Панель действий" className="mono-capsule max-lg:hidden">
      {actions.map((action, index) => {
        if (!action)
          return <span key={`sep-${index}`} aria-hidden className="mono-capsule-separator" />;
        const Icon = action.icon;
        const button = (
          <button
            type="button"
            aria-label={action.label}
            data-active={action.active ? "" : undefined}
            onClick={action.onClick}
            className="mono-capsule-button focus-ring"
          >
            <Icon strokeWidth={1.75} aria-hidden />
            {action.badge ? (
              <span aria-hidden className="mono-capsule-badge">
                {action.badge}
              </span>
            ) : null}
          </button>
        );
        // Триггер подсказки вкладывается в триггер меню: оба asChild сливаются на одной кнопке
        const trigger = <TooltipTrigger asChild>{button}</TooltipTrigger>;
        return (
          <Tooltip key={action.key}>
            {action.render ? action.render(trigger) : trigger}
            <TooltipContent side="right" sideOffset={12}>
              {action.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </aside>
  );
}

/** Заголовок экрана компьютера: 44/48 и статус-плашка справа на уровне заголовка */
export function ScreenTitle({
  title,
  status,
  controls,
}: {
  title: string;
  status?: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 pt-6 pb-6">
      <div className="flex items-center justify-between gap-4">
        <h1 data-screen-title className="type-screen min-w-0 truncate">
          {title}
        </h1>
        {status ? <span className="mono-status shrink-0">{status}</span> : null}
      </div>
      {controls ? (
        <div className="flex flex-wrap items-center justify-between gap-3">{controls}</div>
      ) : null}
    </div>
  );
}

export interface TabItem {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Нижняя панель телефона (2.5): 64 + safe-area, белая с тенью сверху, активный пункт —
 * чёрная таблетка за иконкой. Пункты роли и «Ещё»; выбор вкладки ведёт стек оболочки.
 */
export function PhoneTabBar({
  items,
  activeKey,
  onSelect,
  navRef,
  className,
}: {
  items: readonly TabItem[];
  activeKey: string | null;
  onSelect?: (item: TabItem) => void;
  navRef?: React.Ref<HTMLElement>;
  className?: string;
}) {
  return (
    <nav ref={navRef} aria-label="Основные разделы" className={cn("mono-tabbar", className)}>
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = item.key === activeKey;
          const Icon = item.icon;
          return (
            <li key={item.key} className="min-w-0 flex-1">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                data-tour={`tab-${item.key}`}
                onClick={(event) => {
                  if (!onSelect) return;
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                    return;
                  event.preventDefault();
                  onSelect(item);
                }}
                className="mono-tab focus-ring [touch-action:manipulation]"
              >
                <span className="mono-tab-icon">
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.75} aria-hidden />
                </span>
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
