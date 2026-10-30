import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import { contactTgUrl, VIDEO } from "@/lib/site/config";
import { LANDING, leadMessage } from "@/lib/site/copy";
import { cn } from "@/lib/utils";
import { siteButton } from "@/components/site/parts";
import { DocsFragment, QueueFragment, Reveal, ReportFragment, SupplyFragment } from "./fragments";
import { HeroWeek } from "./hero-week";
import { LeadForm } from "./LeadForm";
import { track } from "@/lib/site/analytics";

/**
 * Лендинг «ГАЙКА: помощник подрядчика» (ADR-059, S7). Порядок секций и механика из правок
 * 25.10 (ADR-053) сохранены: появление один раз, вопросы, форма, липкая кнопка телефона.
 * Содержание и вид переписаны в «Монохром»: светлые карточки с воздухом, чёрная главная
 * кнопка. Справа на первом экране живая неделя демо, а не картинка.
 */
export function Landing() {
  const hero = useRef<HTMLElement>(null);
  const lead = useRef<HTMLElement>(null);
  useEffect(() => track("landing_view"), []);
  return (
    <div className="landing-page">
      <Hero ref={hero} />
      <Modules />
      <Pilot />
      <Audience />
      <Limits />
      <Price />
      {VIDEO.url ? <Video /> : null}
      <Faq />
      <Lead ref={lead} />
      <StickyDemo hero={hero} lead={lead} />
    </div>
  );
}

/* ------------------------------------------------------------------ 1. Первый экран */

function Hero({ ref }: { ref: React.Ref<HTMLElement> }) {
  const { hero } = LANDING;
  return (
    <section ref={ref} className="landing-hero">
      <div className="site-wrap landing-hero-inner">
        <div className="landing-hero-copy">
          <p className="site-caption site-rise font-medium text-text-2">{hero.eyebrow}</p>
          <h1 className="site-h1 site-rise mt-4 text-text">{hero.title}</h1>
          <p className="site-lead site-rise mt-5 text-text-2">{hero.lead}</p>
          <div className="landing-hero-actions site-rise mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href="#lead"
              className={siteButton.primary}
              data-cta="lead"
              onClick={() => track("cta_lead", { place: "hero" })}
            >
              {hero.primary}
              <ArrowRight className="size-5" aria-hidden />
            </a>
            <Link
              to="/demo"
              className={siteButton.secondary}
              data-cta="demo"
              onClick={() => track("cta_demo", { place: "hero" })}
            >
              {hero.secondary}
            </Link>
          </div>
          <p className="site-caption site-rise mt-4 text-text-3">{hero.note}</p>
        </div>
        <Reveal delay={200} className="landing-hero-fragment">
          <HeroWeek />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Общие кирпичи */

function Section({
  id,
  title,
  lead,
  children,
  className,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("site-section border-t border-line", className)}>
      <div className="site-wrap">
        <Reveal className="landing-section-heading">
          <h2 id={id} className="site-h2 max-w-[22ch] text-text">
            {title}
          </h2>
          {lead ? <div className="site-body mt-3 max-w-[640px] text-text-2">{lead}</div> : null}
        </Reveal>
        <div className="mt-8 lg:mt-12">{children}</div>
      </div>
    </section>
  );
}

function Points({
  items,
  layout = "two",
}: {
  items: readonly string[];
  /** «three» для трёх пунктов в ряд, «one» для колонки рядом с фрагментом */
  layout?: "one" | "two" | "three";
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-1 gap-3",
        layout === "two" && "sm:grid-cols-2",
        layout === "three" && "lg:grid-cols-3",
      )}
    >
      {items.map((item, index) => {
        return (
          <Reveal as="li" key={item} delay={index * 80} className="landing-point flex h-full gap-3">
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-text" />
            <span className="site-body text-text">{item}</span>
          </Reveal>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ 2. Три модуля */

const MODULE_SCREEN: Record<string, ReactNode> = {
  time: (
    <div className="flex flex-col gap-2">
      <QueueFragment />
      <ReportFragment />
    </div>
  ),
  supply: <SupplyFragment />,
  docs: <DocsFragment />,
};

/** Куда ведёт «Посмотреть в демо»: учёт времени показом, остальные модули выбором роли */
const MODULE_DEMO: Record<string, "/demo" | "/gas"> = {
  time: "/demo",
  supply: "/gas",
  docs: "/gas",
};

function Modules() {
  const { modules } = LANDING;
  return (
    <Section id="modules" title={modules.title} lead={modules.lead}>
      <ul className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {modules.items.map((item, index) => (
          <Reveal
            as="li"
            key={item.key}
            delay={index * 120}
            className="landing-module mono-card flex h-full flex-col gap-5"
          >
            <h3 className="site-h3 text-text">{item.title}</h3>
            <ol className="flex flex-col gap-2" aria-label={`${item.title}: шаги`}>
              {item.steps.map((step, i) => (
                <li key={step} className="flex items-baseline gap-3">
                  <span className="site-caption text-text-3 tnum">{i + 1}</span>
                  <span className="site-body text-text">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-auto">{MODULE_SCREEN[item.key]}</div>
            <Link
              to={MODULE_DEMO[item.key]!}
              onClick={() => track("cta_demo", { place: `module-${item.key}` })}
              className="inline-flex min-h-11 items-center gap-1.5 self-start text-body-strong text-text underline-offset-4 focus-ring is-hover:underline"
            >
              {modules.open}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Reveal>
        ))}
      </ul>
      <p className="site-caption mt-4 text-text-3">Примеры из демо, вымышленные данные.</p>
    </Section>
  );
}

/* ------------------------------------------------------------------ 3. Как внедряем */

function Pilot() {
  const { pilot } = LANDING;
  return (
    <Section id="pilot" title={pilot.title} lead={pilot.lead}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {pilot.columns.map((column, index) => (
          <Reveal
            key={column.title}
            delay={index * 100}
            className="landing-pilot-column flex flex-col gap-4"
          >
            <h3 className="site-h3 text-text">{column.title}</h3>
            <Points items={column.items} layout="one" />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ 4. Для кого */

function Audience() {
  const { audience } = LANDING;
  return (
    <Section id="audience" title={audience.title}>
      <Points items={audience.items} layout="two" />
      <Reveal className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="site-body text-text-2">{audience.caseText}</p>
        <Link to="/case/gas" className={cn(siteButton.secondary, "shrink-0")}>
          {audience.caseLink}
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ 5. Честно о границах */

function Limits() {
  const { limits } = LANDING;
  return (
    <Section id="limits" title={limits.title}>
      <Reveal className="mono-card mono-card-inverse landing-limits">
        <ul className="flex flex-col gap-4">
          {limits.items.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-current" />
              <span className="site-body">{item}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ 6. Цена */

function Price() {
  const { price } = LANDING;
  return (
    <Section id="price" title={price.title}>
      <Reveal className="landing-price mono-card flex flex-col gap-2">
        <p className="site-h3 text-text tnum">{price.pilot}</p>
        <p className="site-body text-text-2">{price.after}</p>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ Видео (если задано) */

function Video() {
  const [play, setPlay] = useState(false);
  return (
    <Section id="video" title="Показ за минуту">
      <div className="aspect-video overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        {play ? (
          <video src={VIDEO.url} controls autoPlay playsInline className="size-full" />
        ) : (
          <button
            type="button"
            onClick={() => setPlay(true)}
            className="relative grid size-full place-items-center focus-ring"
            aria-label="Смотреть показ"
          >
            {VIDEO.poster ? (
              <img src={VIDEO.poster} alt="" className="absolute inset-0 size-full object-cover" />
            ) : null}
            <span className="relative grid size-16 place-items-center rounded-full bg-pill text-pill-text">
              <Play className="size-6 fill-current" aria-hidden />
            </span>
          </button>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ 7. Вопросы */

function Faq() {
  const { faq } = LANDING;
  return (
    <Section id="faq" title={faq.title}>
      <div className="landing-faq overflow-hidden [&>details+details]:border-t [&>details+details]:border-line">
        {faq.items.map((item) => (
          <details key={item.q} className="group">
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-4 focus-ring [&::-webkit-details-marker]:hidden">
              <span className="site-body min-w-0 flex-1 font-medium text-text">{item.q}</span>
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-text-2 transition-transform duration-150 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="site-body max-w-[760px] pb-6 text-text-2">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ 8. Заявка */

function Lead({ ref }: { ref: React.Ref<HTMLElement> }) {
  const { lead } = LANDING;
  return (
    <section
      ref={ref}
      id="lead"
      aria-labelledby="lead-title"
      className="site-section border-t border-line"
    >
      <div className="site-wrap grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <h2 id="lead-title" className="site-h2 text-text">
            {lead.title}
          </h2>
          <p className="site-body mt-3 max-w-[520px] text-text-2">{lead.text}</p>
          <a
            href={contactTgUrl(leadMessage("landing"))}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-body-strong text-text underline-offset-4 focus-ring is-hover:underline"
          >
            {lead.telegram}
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
        <LeadForm source="landing" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Липкая кнопка телефона */

function StickyDemo({
  hero,
  lead,
}: {
  hero: React.RefObject<HTMLElement | null>;
  lead: React.RefObject<HTMLElement | null>;
}) {
  const [heroVisible, setHeroVisible] = useState(true);
  const [leadVisible, setLeadVisible] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const watch = (el: HTMLElement | null, set: (value: boolean) => void) => {
      if (!el) return null;
      const observer = new IntersectionObserver((entries) =>
        set(entries[0]?.isIntersecting ?? false),
      );
      observer.observe(el);
      return observer;
    };
    const a = watch(hero.current, setHeroVisible);
    const b = watch(lead.current, setLeadVisible);
    return () => {
      a?.disconnect();
      b?.disconnect();
    };
  }, [hero, lead]);
  const hidden = heroVisible || leadVisible;
  return (
    <div
      className="site-sticky fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden"
      data-hidden={hidden ? "" : undefined}
      aria-hidden={hidden || undefined}
    >
      <Link
        to="/demo"
        tabIndex={hidden ? -1 : undefined}
        onClick={() => track("cta_demo", { place: "sticky" })}
        className={cn(siteButton.primary, "landing-sticky-button w-full")}
      >
        {LANDING.hero.secondary}
        <ArrowRight className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
