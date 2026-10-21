/**
 * Крупный заголовок экрана, который уходит при прокрутке (ADR-045 «Финальный интерфейс», 4.2), как в iOS и VK:
 * пока он виден, компактная шапка пустая; когда он ушёл под шапку, его текст встаёт в неё.
 * Следит IntersectionObserver, без обработчиков прокрутки и скачков разметки.
 */
import { useCallback, useEffect, useState } from "react";

/** Высота компактной шапки: заголовок «ушёл», когда скрылся под ней */
const HEADER = 52;

export function useCollapsingTitle(resetKey?: string): {
  ref: (element: HTMLElement | null) => void;
  collapsed: boolean;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);

  useEffect(() => {
    setCollapsed(false);
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!!entry && !entry.isIntersecting),
      { rootMargin: `-${HEADER}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, resetKey]);

  return { ref, collapsed };
}
