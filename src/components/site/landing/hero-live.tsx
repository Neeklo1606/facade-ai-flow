import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import {
  formatRub,
  HERO_BEFORE_RUB,
  HERO_ENTRY_RUB,
  SAMPLE,
  WEEK_SAMPLE,
  WEEK_TEXT,
  WEEK_TOTAL_RUB,
} from "@/lib/site/sample";
import { LANDING, SAMPLE_NOTE } from "@/lib/site/copy";
import { prefersReducedMotion } from "../motion";
import { cn } from "@/lib/utils";

/**
 * Живой фрагмент первого экрана (ADR-067, разделы 7.1 и 8): неделя «Демо-подрядчика»
 * и запись ОБ-200 на проверке. Один раз после загрузки запись подтверждается, и итог недели
 * досчитывается на её сумму за 600 мс. С сервера приходит состояние «до подтверждения»:
 * без скриптов всё согласовано, ничего не прыгает. reduced-motion сразу ставит конечное
 * состояние. Это текст, а не картинка: числа считает domain (sample.ts).
 */
const ENTRY_RUB = HERO_ENTRY_RUB;
const BEFORE_RUB = HERO_BEFORE_RUB;
const MAX_DAY = Math.max(...WEEK_SAMPLE.amountRub);

export function HeroLive() {
  const [confirmed, setConfirmed] = useState(false);
  const [total, setTotal] = useState(BEFORE_RUB);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setConfirmed(true);
      setTotal(WEEK_TOTAL_RUB);
      return;
    }
    let frame = 0;
    const timer = window.setTimeout(() => {
      setConfirmed(true);
      const started = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / 600);
        const eased = 1 - (1 - t) ** 3;
        setTotal(Math.round(BEFORE_RUB + ENTRY_RUB * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 900);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, []);

  const last = WEEK_SAMPLE.amountRub.length - 1;
  return (
    <figure className="site-hero-live m-0" aria-label="Пример из демо: неделя бригад">
      <div className="mono-card flex flex-col gap-5">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-body-strong text-text">{LANDING.hero.fragment}</span>
          <span className="text-meta text-text-3 tnum">{WEEK_SAMPLE.period}</span>
        </figcaption>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-inset bg-panel-2 px-4 py-3">
            <p className="text-meta text-text-3">Начислено</p>
            <p className="site-metric mt-1 text-text tnum" aria-live="off">
              {formatRub(total)}
            </p>
          </div>
          <div className="rounded-inset bg-panel-2 px-4 py-3">
            <p className="text-meta text-text-3">Часы бригад</p>
            <p className="site-metric mt-1 text-text tnum">{WEEK_TEXT.hours}</p>
          </div>
        </div>
        <div className="site-hero-bars" aria-hidden>
          {WEEK_SAMPLE.amountRub.map((value, index) => {
            const amount = index === last ? value - (confirmed ? 0 : ENTRY_RUB) : value;
            return (
              <span key={WEEK_SAMPLE.days[index]} className="flex flex-col items-center gap-1.5">
                <span className="flex h-full w-full items-end">
                  <span
                    className={cn("site-hero-bar w-full", index === last && "is-last")}
                    style={{ height: `${Math.round((amount / MAX_DAY) * 100)}%` }}
                  />
                </span>
                <span className="text-meta text-text-3">{WEEK_SAMPLE.days[index]}</span>
              </span>
            );
          })}
        </div>
        <div
          className="flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3"
          data-confirmed={confirmed ? "" : undefined}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-strong text-text">{SAMPLE.object}</span>
            <span className="mt-0.5 block text-meta text-text-3 tnum">
              {SAMPLE.brigade} · {SAMPLE.start}–{SAMPLE.end} · {SAMPLE.hours}
            </span>
            <span
              className={cn(
                "site-hero-chip mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta-strong",
                confirmed ? "bg-ok-bg text-ok" : "bg-surface-2 text-text-2",
              )}
            >
              {confirmed ? (
                <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
              ) : (
                <Clock className="size-3.5" aria-hidden />
              )}
              {confirmed ? "Подтверждено" : "На проверке"}
            </span>
          </span>
          <span className="shrink-0 text-right text-body-strong text-text tnum">
            {SAMPLE.amount}
          </span>
        </div>
      </div>
      <p className="site-caption mt-3 text-text-3">{SAMPLE_NOTE}</p>
    </figure>
  );
}
