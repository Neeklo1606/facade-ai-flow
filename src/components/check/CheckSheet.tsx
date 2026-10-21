/**
 * Лист деталей факта на телефоне и планшете, как лист события в календаре референса: светлый
 * лист снизу почти на весь экран, ручка сверху, тянется вниз для закрытия. Лист модальный и
 * закрывает экран вместе с нижней панелью (оболочка — свой слой с z-index 1), поэтому капсула
 * решения плавает у нижнего края листа, над полосой жестов, и ничем не перекрыта.
 */
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Сколько протащить ручку вниз, чтобы лист закрылся */
const CLOSE_AT = 96;

export function CheckSheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; from: number } | null>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      // Шторка объёма поверх листа закрывается своей клавишей: лист не трогаем
      if (event.key === "Escape" && !document.querySelector("[role='dialog'][data-state='open']"))
        onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
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
    if (moved > CLOSE_AT) onClose();
  };

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-[34] bg-[var(--overlay)] animate-in fade-in-0"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-check-sheet
        style={shift ? { transform: `translateY(${shift}px)` } : undefined}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[35] mx-auto max-w-[680px] overflow-y-auto overscroll-contain rounded-t-[32px] bg-surface outline-none",
          "top-[max(12px,env(safe-area-inset-top))]",
          !shift && "transition-transform duration-200",
          "animate-in slide-in-from-bottom-8 fade-in-0 duration-300",
        )}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="sticky top-0 z-10 flex h-6 touch-none justify-center bg-surface pt-2"
        >
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-line-2" />
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
