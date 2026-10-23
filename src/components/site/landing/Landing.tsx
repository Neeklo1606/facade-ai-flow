import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  ClipboardCheck,
  FileSearch,
  History,
  ListChecks,
  MessageSquareText,
  Play,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { CASE_STATUS, contactTgUrl, PRICES, VIDEO } from "@/lib/site/config";
import { LANDING, leadMessage } from "@/lib/site/copy";
import { cn } from "@/lib/utils";
import { siteButton } from "@/components/site/parts";
import {
  BotFragment,
  CalcFragment,
  QueueFragment,
  ReportFragment,
  Reveal,
  SampleNote,
  WeekTableFragment,
} from "./fragments";
import { LeadForm } from "./LeadForm";
import { track } from "@/lib/site/analytics";

/**
 * Лендинг ГАЙКИ (ADR-050, 01_SPEC 9): двенадцать секций сверху вниз, тексты из `copy.ts`.
 * Первый экран целиком в 390 x 664; на компьютере справа живая последовательность записи.
 * Одна тёмная секция «Как это работает». Липкая «Открыть демо» на телефоне после первого экрана.
 */
export function Landing() {
  const hero = useRef<HTMLElement>(null);
  const lead = useRef<HTMLElement>(null);
  useEffect(() => track("landing_view"), []);
  return (
    <>
      <Hero ref={hero} />
      <Pains />
      <How />
      <Foreman />
      <Trust />
      <Report />
      <CaseBlock />
      <More />
      {VIDEO.url ? <Video /> : null}
      <Start />
      <Faq />
      <Lead ref={lead} />
      <StickyDemo hero={hero} lead={lead} />
    </>
  );
}

/* ------------------------------------------------------------------ 1. Первый экран */

function Hero({ ref }: { ref: React.Ref<HTMLElement> }) {
  const { hero } = LANDING;
  return (
    <section ref={ref} className="relative isolate overflow-hidden">
      <span aria-hidden className="site-glow -z-10" />
      <div className="site-wrap grid grid-cols-1 gap-12 pt-8 pb-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:pt-20 lg:pb-28">
        <div>
          <p className="site-caption site-rise font-medium text-text-2">{hero.eyebrow}</p>
          <h1 className="site-h1 site-rise mt-3 max-w-[14ch] text-text lg:mt-5">{hero.title}</h1>
          <p className="site-lead site-rise mt-4 max-w-[640px] text-text-2 lg:mt-6">{hero.lead}</p>
          <div className="site-rise mt-8 flex flex-col gap-3 sm:flex-row lg:mt-10">
            <Link
              to="/demo"
              className={siteButton.primary}
              data-cta="demo"
              onClick={() => track("cta_demo", { place: "hero" })}
            >
              {hero.primary}
              <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link
              to="/razbor"
              search={{ from: "landing" }}
              className={siteButton.secondary}
              onClick={() => track("cta_razbor", { place: "hero" })}
            >
              {hero.secondary}
            </Link>
          </div>
          <p className="site-caption site-rise mt-4 text-text-3">{hero.note}</p>
        </div>
        {/*
          Путь одной записи сверху вниз, один раз при появлении: справа от текста с 1024,
          под текстом на планшете. На телефоне его нет: первый экран только текст и кнопки
        */}
        <div
          className="hidden flex-col gap-3 md:flex md:max-w-[560px] lg:max-w-none"
          aria-label="Путь одной записи"
        >
          <Reveal delay={150}>
            <BotFragment className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line" />
          </Reveal>
          <Reveal delay={450}>
            <QueueFragment />
          </Reveal>
          <Reveal delay={750}>
            <ReportFragment />
          </Reveal>
          <Reveal delay={900}>
            <SampleNote />
          </Reveal>
        </div>
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
  dark = false,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("site-section", dark ? "site-dark" : "border-t border-line", className)}
    >
      <div className="site-wrap">
        <h2 id={id} className="site-h2 max-w-[22ch] text-text">
          {title}
        </h2>
        {lead ? <div className="site-body mt-3 max-w-[640px] text-text-2">{lead}</div> : null}
        <div className="mt-8 lg:mt-12">{children}</div>
      </div>
    </section>
  );
}

function Points({
  items,
  icons,
  layout = "two",
}: {
  items: readonly string[];
  icons?: readonly (typeof Play)[];
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
        const Icon = icons?.[index];
        return (
          <Reveal
            as="li"
            key={item}
            delay={index * 80}
            className="flex h-full gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line"
          >
            {Icon ? (
              <Icon className="mt-0.5 size-5 shrink-0 text-orange" strokeWidth={1.75} aria-hidden />
            ) : (
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-orange" />
            )}
            <span className="site-body text-text">{item}</span>
          </Reveal>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ 2. Знакомо? */

function Pains() {
  const { pains } = LANDING;
  return (
    <Section id="pains" title={pains.title}>
      <Points items={pains.items} layout="three" />
      <p className="site-caption mt-5 max-w-[640px] text-text-3">{pains.caption}</p>
    </Section>
  );
}

/* ------------------------------------------------------------------ 3. Как это работает */

function How() {
  const { how } = LANDING;
  const fragments = [
    <BotFragment key="bot" />,
    <QueueFragment key="queue" />,
    <CalcFragment key="calc" />,
    <ReportFragment key="report" />,
  ];
  return (
    <Section id="how" title={how.title} dark>
      <ol className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-14">
        {how.steps.map((step, index) => (
          <li key={step.title}>
            <Reveal delay={index * 100} className="flex flex-col gap-4">
              <div className="flex gap-4">
                <span className="site-caption font-medium text-orange tnum">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="site-h3 text-text">{step.title}</h3>
                  <p className="site-body mt-1 text-text-2">{step.text}</p>
                </div>
              </div>
              {fragments[index]}
            </Reveal>
          </li>
        ))}
      </ol>
      <SampleNote className="mt-8" />
    </Section>
  );
}

/* ------------------------------------------------------------------ 4. Бригадиру */

function Foreman() {
  const { foreman } = LANDING;
  return (
    <Section id="foreman" title={foreman.title}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
        <Points
          items={foreman.items}
          icons={[MessageSquareText, Smartphone, ShieldCheck]}
          layout="one"
        />
        <Reveal className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
          <BotFragment />
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ 5. Цифрам можно верить */

function Trust() {
  const { trust } = LANDING;
  return (
    <Section id="trust" title={trust.title}>
      <Points items={trust.items} icons={[ClipboardCheck, FileSearch, ListChecks, History]} />
    </Section>
  );
}

/* ------------------------------------------------------------------ 6. Отчёт как ваш */

function Report() {
  const { report } = LANDING;
  return (
    <Section id="report" title={report.title} lead={report.text}>
      <Reveal>
        <WeekTableFragment />
      </Reveal>
      <SampleNote className="mt-3" />
    </Section>
  );
}

/* ------------------------------------------------------------------ 7. Кейс */

function CaseBlock() {
  const { case: item } = LANDING;
  return (
    <Section id="case" title={item.title}>
      <Reveal className="flex flex-col gap-5 rounded-2xl bg-surface p-6 ring-1 ring-line lg:flex-row lg:items-center lg:justify-between lg:p-8">
        <div className="max-w-[640px]">
          <p className="site-caption font-medium text-orange">{CASE_STATUS}</p>
          <p className="site-body mt-2 text-text">{item.text}</p>
        </div>
        <Link to="/case/gas" className={cn(siteButton.secondary, "shrink-0")}>
          {item.more}
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ 8. Что ещё умеет */

function More() {
  const { more } = LANDING;
  return (
    <Section id="more" title={more.title} lead={more.caption}>
      <ul className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line [&>li+li]:border-t [&>li+li]:border-line">
        {more.items.map((item) => (
          <li key={item}>
            <Link
              to="/demo"
              className="flex min-h-16 items-center gap-3 px-5 py-3 transition-colors duration-100 focus-ring active:bg-surface-2 is-hover:bg-surface-2"
            >
              <span className="site-body min-w-0 flex-1 text-text">{item}</span>
              <ArrowUpRight className="size-5 shrink-0 text-text-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
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

/* ------------------------------------------------------------------ 9. Как начать */

function Start() {
  const { start } = LANDING;
  return (
    <Section id="start" title={start.title}>
      <ol className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {start.steps.map((step, index) => {
          const price = PRICES[step.key as keyof typeof PRICES];
          return (
            <Reveal
              as="li"
              key={step.key}
              delay={index * 80}
              className="flex h-full flex-col gap-2 rounded-2xl bg-surface p-5 ring-1 ring-line"
            >
              <span className="site-caption font-medium text-text-3 tnum">Шаг {index + 1}</span>
              <h3 className="site-h3 text-text">{step.title}</h3>
              <p className="site-body text-text-2">{step.text}</p>
              {/* Цена только из конфигурации: без значения строки нет вовсе (01_SPEC 13) */}
              {price ? (
                <p className="site-body mt-auto pt-2 font-medium text-text">{price}</p>
              ) : null}
              {step.key === "razbor" ? (
                <Link
                  to="/razbor"
                  search={{ from: "landing" }}
                  onClick={() => track("cta_razbor", { place: "steps" })}
                  className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-2 text-body-strong text-orange focus-ring"
                >
                  Подробнее
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </Reveal>
          );
        })}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------ 10. Вопросы */

function Faq() {
  const { faq } = LANDING;
  return (
    <Section id="faq" title={faq.title}>
      <div className="max-w-[760px] overflow-hidden rounded-2xl bg-surface ring-1 ring-line [&>details+details]:border-t [&>details+details]:border-line">
        {faq.items.map((item) => (
          <details key={item.q} className="group">
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-5 py-3 focus-ring [&::-webkit-details-marker]:hidden">
              <span className="site-body min-w-0 flex-1 font-medium text-text">{item.q}</span>
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-text-2 transition-transform duration-150 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="site-body px-5 pb-5 text-text-2">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ 11. Заявка */

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
          <p className="site-body mt-3 max-w-[520px] text-text-2">
            Оставьте контакты: свяжемся, пришлём, куда отправить сообщения бригадиров и отчёт, и
            через 3 рабочих дня покажем вашу неделю в ГАЙКЕ.
          </p>
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
        className={cn(siteButton.primary, "w-full shadow-[0_8px_24px_rgba(0,0,0,0.18)]")}
      >
        {LANDING.hero.primary}
        <ArrowRight className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
