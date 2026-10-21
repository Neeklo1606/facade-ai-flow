/**
 * Нижние слои экрана (ADR-045, раздел 2.6): нижняя панель, панель действий, полоса показа.
 *
 * Правило одного слоя: над нижней панелью одновременно не больше одного плавающего слоя.
 * Открытая шторка или карточка закрывает нижнюю панель целиком и показывает свою панель
 * действий, поэтому шторка регистрирует себя здесь, а оболочка прячет панель и полосу показа
 * атрибутом `data-sheet-open` на <html>.
 *
 * Каждый видимый слой у нижнего края регистрирует свою высоту. Сумма уходит в CSS-переменную
 * `--bottom-inset` на <html>: контент экрана получает нижний отступ «слои + 16» и ни один
 * элемент не уходит под слой без возможности докрутить.
 */
import { useEffect, useSyncExternalStore, type RefObject } from "react";

const layers = new Map<string, number>();
let sheets = 0;
const listeners = new Set<() => void>();

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.toggleAttribute("data-sheet-open", sheets > 0);
  // Пока открыта шторка, нижней панели и полосы показа нет: их высоты не считаются
  const inset = sheets > 0 ? 0 : [...layers.values()].reduce((sum, h) => sum + h, 0);
  root.style.setProperty("--bottom-inset", `${Math.round(inset)}px`);
  // Высота нижней панели отдельно: панель действий экрана стоит прямо над ней, а где панели
  // нет (кабинет компании), — у нижнего края
  root.style.setProperty(
    "--tabbar-inset",
    `${Math.round(sheets > 0 ? 0 : (layers.get("tabbar") ?? 0))}px`,
  );
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Открыта ли шторка или карточка с панелью действий */
export function useSheetOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => sheets > 0,
    () => false,
  );
}

/** Шторка или карточка открыта: нижняя панель и полоса показа уходят, пока она на экране */
export function useSheetLayer(open: boolean) {
  useEffect(() => {
    if (!open) return;
    sheets += 1;
    apply();
    return () => {
      sheets -= 1;
      apply();
    };
  }, [open]);
}

/**
 * Слой у нижнего края: регистрирует свою высоту, пока виден. Высота меряется вместе
 * с безопасной зоной, поэтому отступ контента совпадает с тем, что закрыто на экране.
 */
export function useBottomLayer(id: string, ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const measure = () => {
      // Скрытый медиазапросом слой (display: none на компьютере) даёт высоту 0
      const height = element.getBoundingClientRect().height;
      if (layers.get(id) === height) return;
      layers.set(id, height);
      apply();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      layers.delete(id);
      apply();
    };
  }, [id, ref, active]);
}
