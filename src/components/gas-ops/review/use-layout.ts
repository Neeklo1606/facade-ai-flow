/**
 * Раскладка экранов проверки и журнала: десктоп или телефон, и где кончается свободное место
 * снизу. Закреплённые кнопки не должны прятаться под нижней панелью оболочки и под полосой
 * показа (ADR-044, F3): обе плавают над контентом и меняют высоту, поэтому меряем их.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

const DESKTOP = "(min-width: 1024px)";

function subscribeMedia(listener: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Десктоп от 1024 px: список и панель рядом. На сервере и в первом кадре считаем телефоном */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeMedia,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/** Плавающие слои оболочки внизу экрана: нижняя панель телефона и полоса показа */
const FLOATING = ['nav[aria-label="Основные разделы"]', "[data-gas-show-dock]"];

/**
 * Сколько пикселей снизу занято плавающими слоями оболочки, с зазором 8 px. На десктопе
 * нижней панели нет, остаётся полоса показа, если показ идёт.
 */
export function useFloatingBottom(): number {
  const [bottom, setBottom] = useState(96);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = window.innerHeight;
        let top = height;
        for (const selector of FLOATING) {
          const element = document.querySelector(selector);
          if (!element) continue;
          const rect = element.getBoundingClientRect();
          if (rect.height > 0 && rect.top < height) top = Math.min(top, rect.top);
        }
        setBottom(Math.max(8, Math.round(height - top + 8)));
      });
    };
    measure();
    window.addEventListener("resize", measure);
    // Полоса показа появляется и меняет высоту без смены экрана
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);
  return bottom;
}
