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
/** Сколько ждать строку и её появления в окне */
const WAIT_MS = 15_000;

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
  // Последние значения для эффекта: сам эффект зависит только от адреса и строки
  const latest = useRef({ target, phone, setPeriod, expand });
  latest.current = { target, phone, setPeriod, expand };
  const rowId = target?.rowId ?? null;

  /*
   * Раскрытие, подсветка и поиск строки. У эффекта своя очистка, без флага «уже сделано»:
   * строгий режим React и смена раскладки (дерево на телефоне, таблица на десктопе) повторно
   * запускают эффект, и он просто начинает заново. Каждые 150 мс берём текущую строку,
   * прокручиваем к ней (повторно, если восстановление прокрутки вернуло окно наверх) и
   * засчитываем шаг, когда она видна хотя бы на 60 процентов.
   */
  useEffect(() => {
    if (!highlight || !rowId) return;
    const { target: current, phone: isPhone, setPeriod: pick, expand: open } = latest.current;
    if (!current) return;
    open(current.ancestors);
    if (isPhone && current.dayIndex !== null) pick(current.dayIndex);
    setFlash(rowId);

    const selector = `[data-report-row="${CSS.escape(rowId)}"]`;
    const started = Date.now();
    let scrolledAt = 0;
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - started > WAIT_MS) {
        window.clearInterval(timer);
        return;
      }
      const element = document.querySelector(selector);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      if (rect.height > 0 && visible / rect.height >= 0.6) {
        window.clearInterval(timer);
        gasShowEvent("gasReportSeen");
        return;
      }
      if (now - scrolledAt > 900) {
        const first = scrolledAt === 0;
        scrolledAt = now;
        element.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: first ? "smooth" : "auto",
        });
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [highlight, rowId]);

  // Подсветка гаснет через FLASH_MS: таймер привязан к самой подсветке
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return flash;
}
