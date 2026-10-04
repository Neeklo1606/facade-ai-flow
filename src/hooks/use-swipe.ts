import { useRef, useState, type PointerEvent } from "react";

/**
 * Свайп карточки вбок (ADR-028, п. 3). Карточка идёт за пальцем, отпустили дальше порога —
 * срабатывает действие. Кнопки делают то же самое: свайп никогда не единственный способ.
 *
 * Вертикальное движение отдаём странице: иначе список нельзя было бы прокрутить пальцем,
 * начав с карточки.
 */
const TRIGGER = 96;
const LOCK = 12;

export function useSwipe({ onLeft, onRight }: { onLeft?: () => void; onRight?: () => void }) {
  const drag = useRef<{ id: number; x: number; y: number; locked: boolean | null } | null>(null);
  const [shift, setShift] = useState(0);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.pointerType === "mouse") return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, locked: null };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state?.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (state.locked === null) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      state.locked = Math.abs(dx) > Math.abs(dy);
      if (state.locked) event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!state.locked) return;
    setShift(dx);
  };

  const finish = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state?.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    drag.current = null;
    setShift(0);
    if (!state.locked) return;
    if (dx > TRIGGER) onRight?.();
    else if (dx < -TRIGGER) onLeft?.();
  };

  return {
    shift,
    /** Насколько действие «созрело»: 0 — не тронуто, 1 — отпусти и сработает */
    progress: Math.min(1, Math.abs(shift) / TRIGGER),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
