import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useSheetLayer } from "@/lib/ui/bottom-layers";

/**
 * Шторка снизу (ADR-026, п. 9): подложка, перетаскивание вниз закрывает, Esc закрывает,
 * фокус возвращается на вызвавший элемент, высота по содержимому до 88 % экрана.
 *
 * Собрана на том же Radix Dialog, что остальные окна продукта, а не на отдельной библиотеке
 * шторок: она добавляла 11 КБ в бандл ради перетаскивания, которое здесь — тридцать строк.
 * Заодно у шторки и окна одинаковые правила закрытия, подложки и возврата фокуса.
 */

/** Сколько надо протащить вниз, чтобы шторка закрылась */
const CLOSE_AT = 96;

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Зачем шторка открыта; пусто — подпись не показывается, но заголовок читается с экрана */
  description?: string;
  children: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  /** Адрес на момент открытия: если действие увело на другой экран, фокус нужен там */
  const openedAt = useRef("");
  const drag = useRef<{ id: number; from: number } | null>(null);
  const [shift, setShift] = useState(0);
  // Открытая шторка закрывает нижнюю панель (ADR-045, 4.4)
  useSheetLayer(open);

  useEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openedAt.current = window.location.href;
  }, [open]);

  /*
   * Системный «назад» закрывает шторку (ADR-048, 4): открытие кладёт запись в историю
   * на том же адресе, «назад» снимает её и закрывает шторку. Закрыли сами (крестик, Esc,
   * подложка) — запись снимаем за собой. Если действие шторки увело на другой экран,
   * его запись уже сверху, и трогать историю нельзя: «назад» отменил бы переход.
   */
  const latest = useRef(onOpenChange);
  latest.current = onOpenChange;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    window.history.pushState({ ...state, __sheet: marker }, "");
    let popped = false;
    const onPop = () => {
      popped = true;
      latest.current(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (popped) return;
      /*
       * Снимаем свою запись чуть позже: действие шторки (смена роли, переход) может увести
       * на другой экран асинхронно, и «назад» сразу отменил бы этот переход. Если сверху
       * уже чужая запись, история не трогается
       */
      window.setTimeout(() => {
        const top = window.history.state as { __sheet?: string } | null;
        if (top?.__sheet === marker) window.history.back();
      }, 250);
    };
  }, [open]);

  /* Перетаскивание за ручку: тянем вниз — шторка идёт за пальцем, отпустили далеко — закрылась */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, from: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    setShift(Math.max(0, event.clientY - drag.current.from));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    const moved = Math.max(0, event.clientY - drag.current.from);
    drag.current = null;
    setShift(0);
    if (moved > CLOSE_AT) onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={content}
          tabIndex={-1}
          style={shift ? { transform: `translateY(${shift}px)` } : undefined}
          onOpenAutoFocus={(event) => {
            /*
             * Фокус переводим на саму шторку, а не на первую кнопку: на телефоне фокус внутри
             * поля поднимал бы клавиатуру. Без этого Tab обходил страницу под шторкой, и
             * с клавиатуры до её действий было не добраться (найдено проверкой ADR-026).
             */
            event.preventDefault();
            content.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            const target = opener.current;
            if (!target?.isConnected) return;
            // Ушли на другой экран — там свой фокус: возвращать его в панель значит его отнять
            if (window.location.href !== openedAt.current) return;
            event.preventDefault();
            target.focus({ preventScroll: true });
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[var(--r-sheet)] bg-surface shadow-pop outline-none",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            !shift && "transition-transform duration-150",
          )}
        >
          {/* Ручка: за неё тянут вниз. Область нажатия во всю ширину — палец не ищет полоску */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="shrink-0 cursor-grab touch-none px-4 pt-3 pb-1 active:cursor-grabbing"
          >
            <span aria-hidden className="mx-auto block h-1 w-9 rounded-full bg-line-2" />
          </div>
          <div className="flex min-h-12 shrink-0 flex-col justify-center px-4 pb-2">
            <DialogPrimitive.Title className="text-heading text-text">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-meta text-text-2">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {/* Нижний пункт не уходит под панель браузера: отступ safe-area и 16 (refs/11) */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Строка шторки: цель нажатия 48 px, подпись и пояснение в две строки. Действие без пояснения
 * заставляет человека нажимать, чтобы узнать, что будет.
 */
export function SheetRow({
  icon,
  label,
  hint,
  onSelect,
  tone = "normal",
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
  /** «danger» — выход и всё, что обрывает работу */
  tone?: "normal" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="focus-ring flex min-h-row-compact w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-fast is-hover:bg-surface-2"
    >
      {icon && <span className="grid size-6 shrink-0 place-items-center text-text-3">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={cn("block text-body", tone === "danger" ? "text-danger" : "text-text")}>
          {label}
        </span>
        {hint && <span className="block text-meta text-text-3">{hint}</span>}
      </span>
    </button>
  );
}
