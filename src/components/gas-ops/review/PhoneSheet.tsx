/**
 * Лист деталей на телефоне, как у календаря в референсах (ADR-044, раздел 2): светлый лист
 * снизу почти на весь экран, крупный заголовок, строки с иконками, капсула действия плавает
 * над нижней панелью оболочки. Нижняя панель и полоса показа остаются видны и доступны:
 * лист лежит под ними, поэтому показ можно вести, не закрывая запись.
 */
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Сколько протащить ручку вниз, чтобы лист закрылся */
const CLOSE_AT = 96;

export function PhoneSheet({
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
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role='menu']")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

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

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-[34] bg-[var(--overlay)] animate-in fade-in-0"
      />
      <div
        ref={panel}
        role="dialog"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-review-sheet
        style={shift ? { transform: `translateY(${shift}px)` } : undefined}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[35] overflow-y-auto overscroll-contain rounded-t-[32px] bg-surface outline-none",
          "top-[max(12px,env(safe-area-inset-top))] shadow-[0_-12px_48px_rgba(0,0,0,0.3)]",
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
    </>
  );
}
