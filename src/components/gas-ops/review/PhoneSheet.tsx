/**
 * Лист деталей записи на телефоне (ADR-045 «Финальный интерфейс», 4.13): сразу 92% экрана,
 * ручка 36 x 4, верхние углы 16, одна мягкая тень. Открытый лист закрывает нижнюю панель
 * оболочки, а полоса показа встаёт строкой под его шапку: внизу остаётся один слой,
 * панель действий листа 64 + safe-area.
 */
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useSheetLayer } from "@/lib/ui/bottom-layers";
import { cn } from "@/lib/utils";
import { GasShowInline } from "../show/GasShowDock";

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
  useSheetLayer(open);

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
        className="fixed inset-0 z-[44] bg-[var(--overlay)] animate-in fade-in-0"
      />
      <div
        ref={panel}
        role="dialog"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-review-sheet
        style={shift ? { transform: `translateY(${shift}px)` } : undefined}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[45] overflow-y-auto overscroll-contain rounded-t-[var(--r-sheet)] bg-surface shadow-pop outline-none",
          "top-[max(8dvh,env(safe-area-inset-top))]",
          "animate-in slide-in-from-bottom-8 fade-in-0 duration-[250ms] motion-reduce:slide-in-from-bottom-0",
        )}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="sticky top-0 z-10 flex h-5 touch-none justify-center bg-surface pt-2"
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-line-2" />
        </div>
        <GasShowInline className="mx-gutter mb-2" />
        {children}
      </div>
    </>
  );
}
