/**
 * Переход из сценария показа: `?highlight=<entryId>` (ADR-044, F3 шаг 4, F6).
 * Раскрывает путь до строки объекта, на телефоне выбирает день записи, прокручивает
 * к строке и подсвечивает её 4 секунды. Когда строка действительно видна на экране,
 * засчитывает шаг показа событием `gasReportSeen`.
 */
import { useEffect, useRef, useState } from "react";
import type { ReportPeriod } from "@/api/gas-report";
import { gasShowEvent } from "@/lib/gas-ops/show";

const FLASH_MS = 4000;

export function useReportHighlight({
  highlight,
  target,
  phone,
  setPeriod,
  expand,
}: {
  highlight: string | null;
  target: { rowId: string; ancestors: string[]; dayIndex: number | null } | null;
  phone: boolean;
  setPeriod: (period: ReportPeriod) => void;
  expand: (ids: string[]) => void;
}): string | null {
  const [flash, setFlash] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!highlight || !target || handled.current === highlight) return;
    handled.current = highlight;
    cleanup.current?.();

    expand(target.ancestors);
    if (phone && target.dayIndex !== null) setPeriod(target.dayIndex);
    setFlash(target.rowId);

    let observer: IntersectionObserver | null = null;
    let tries = 0;
    let frame = 0;
    // Строка появляется после раскрытия родителей: ищем её несколько кадров
    const find = () => {
      const element = document.querySelector(`[data-report-row="${CSS.escape(target.rowId)}"]`);
      if (!element) {
        if (tries++ < 30) frame = window.requestAnimationFrame(find);
        return;
      }
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          gasShowEvent("gasReportSeen");
        },
        { threshold: 0.6 },
      );
      observer.observe(element);
    };
    frame = window.requestAnimationFrame(find);
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);

    cleanup.current = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [highlight, target, phone, setPeriod, expand]);

  // Таймеры живут до ухода с экрана: смена данных не должна обрывать подсветку
  useEffect(() => () => cleanup.current?.(), []);

  return flash;
}
