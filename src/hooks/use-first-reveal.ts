import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { COUNT_MS, claimFirstReveal, countUpValue } from "@/lib/ui/first-reveal";

/* На сервере useLayoutEffect предупреждает: там решение всё равно «без анимации» */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Показывать ли появление экрана (ADR-055, раздел 2.3): да только при первом показе ключа
 * в сессии. На сервере и до монтирования — нет, поэтому разметка сервера и клиента совпадает.
 * Компонент ставит класс reveal, когда хук ответил да; reduced-motion обрабатывает CSS.
 */
export function useFirstReveal(key: string): boolean {
  const [reveal, setReveal] = useState(false);
  useIsoLayoutEffect(() => {
    if (claimFirstReveal(key, sessionStore())) setReveal(true);
  }, [key]);
  return reveal;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Число показателя: от нуля до target за 600 мс, если animate. Иначе и при reduced-motion
 * сразу target. Смена target после счёта показывается без повторного счёта.
 */
export function useCountUp(target: number, animate: boolean): number {
  const [value, setValue] = useState(target);
  const counting = useRef(false);
  const latest = useRef(target);
  latest.current = target;
  // До отрисовки: экран не успевает показать итог перед счётом от нуля
  useIsoLayoutEffect(() => {
    if (!animate || prefersReducedMotion()) return;
    counting.current = true;
    setValue(0);
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = now - start;
      setValue(countUpValue(latest.current, elapsed));
      if (elapsed < COUNT_MS) frame = requestAnimationFrame(tick);
      else counting.current = false;
    });
    return () => {
      counting.current = false;
      cancelAnimationFrame(frame);
    };
  }, [animate]);
  useEffect(() => {
    if (!counting.current) setValue(target);
  }, [target]);
  return value;
}
