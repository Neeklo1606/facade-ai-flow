import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import {
  formatMillions,
  formatRub,
  HERO_HOURS,
  HERO_WEEK,
  WEEK_SAMPLE,
  WEEK_TOTAL_RUB,
} from "@/lib/site/sample";
import { LANDING, SAMPLE_NOTE } from "@/lib/site/copy";
import { prefersReducedMotion } from "../motion";

/**
 * Живой фрагмент первого экрана «Тепло» (docs/design/design-system-warm.md, раздел 4):
 * телефон с экраном «Неделя», стеклянная плашка записи и тёмная панель часов. Запись
 * ГЗ-00096 бригады 2 ждёт проверки; один раз после загрузки она принимается, и итог недели
 * досчитывается на её сумму за 600 мс. С сервера приходит состояние «на проверке»,
 * reduced-motion сразу ставит конечное. Числа из sample.ts, их сверяет тест с демо-набором.
 */
const ENTRY_RUB = HERO_WEEK.entry.amountRub;
const BEFORE_RUB = WEEK_TOTAL_RUB;

export function HeroLive() {
  const { hero } = LANDING;
  const [confirmed, setConfirmed] = useState(false);
  const [total, setTotal] = useState(BEFORE_RUB);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setConfirmed(true);
      setTotal(BEFORE_RUB + ENTRY_RUB);
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

  const accepted = WEEK_SAMPLE.confirmedEntries + (confirmed ? 1 : 0);
  const waiting = HERO_WEEK.pendingEntries - (confirmed ? 1 : 0);
  const { entry } = HERO_WEEK;
  return (
    <figure className="site-hero-live" aria-label={hero.fragment}>
      <div className="site-glass site-hero-toast" data-confirmed={confirmed ? "" : undefined}>
        <span aria-hidden className="site-hero-toast-icon">
          {confirmed ? (
            <Check className="size-5" strokeWidth={2.5} />
          ) : (
            <Clock className="size-5" strokeWidth={2.25} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="site-hero-toast-title">
            {entry.brigade} · {entry.object}
          </span>
          <span className="site-hero-toast-sub">
            {confirmed ? hero.toast.done : hero.toast.pending}
          </span>
        </span>
        <span className="site-hero-toast-sum tnum">+{formatRub(entry.amountRub)}</span>
      </div>

      <div className="site-phone">
        <div className="site-phone-screen">
          <p className="site-phone-hello">{hero.screen.hello}</p>
          <p className="site-phone-title">{hero.screen.title}</p>
          <div className="site-kpi">
            <p className="site-kpi-label">
              {hero.screen.accrued}
              <span className="tnum"> · {WEEK_SAMPLE.period}</span>
            </p>
            <p role="img" aria-label={formatRub(total)} className="site-dot site-kpi-value">
              {formatMillions(total)}
            </p>
            <div className="site-split" aria-hidden>
              <span className="is-ok" style={{ flexGrow: accepted }} />
              <span className="is-wait" style={{ flexGrow: waiting }} />
            </div>
            <p className="site-kpi-legend tnum">
              {accepted} {hero.screen.accepted} · <span>{waiting}</span> {hero.screen.waiting}
            </p>
          </div>
          <div className="site-phone-tiles" aria-hidden>
            <span className="site-tile is-inverse">{hero.screen.close}</span>
            <span className="site-tile">{hero.screen.excel}</span>
          </div>
          <ul className="site-phone-list">
            {HERO_WEEK.brigades.map((row, index) => (
              <li key={row.id} className="site-row">
                <span aria-hidden className="site-avatar" data-tone={index}>
                  {row.short}
                </span>
                <span className="site-row-name">{row.name}</span>
                <span className="site-row-sum tnum">{formatRub(row.amountRub)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="site-glass-dark site-hero-hours">
        <p className="site-hero-hours-label">{hero.hours}</p>
        <p role="img" aria-label={`${HERO_HOURS} часа`} className="site-dot site-hero-hours-value">
          {HERO_HOURS} ч
        </p>
      </div>
      <figcaption className="site-caption site-hero-sample">{SAMPLE_NOTE}</figcaption>
    </figure>
  );
}
