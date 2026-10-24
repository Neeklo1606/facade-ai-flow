import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileSpreadsheet,
  History,
  Mic,
  Play,
  ScanSearch,
  ShieldCheck,
  Sigma,
  Sparkles,
} from "lucide-react";
import { CASE_STATUS, contactTgUrl, PRICES, VIDEO } from "@/lib/site/config";
import { LANDING, leadMessage } from "@/lib/site/copy";
import { cn } from "@/lib/utils";
import { siteButton } from "@/components/site/parts";
import {
  AskFragment,
  BotFragment,
  CalcFragment,
  ProductWindow,
  QueueFragment,
  Reveal,
  SampleNote,
  WeekTableFragment,
} from "./fragments";
import { LeadForm } from "./LeadForm";
import { track } from "@/lib/site/analytics";

/**
 * Лендинг ГАЙКИ (ADR-052, по построению сервисов): первый экран по центру с окном продукта,
 * факты продукта, «Знакомо?», тур по ролям, шаги, возможности сеткой, кейс, что ещё,
 * лестница цен, вопросы, финальный призыв и заявка. Одна тёмная секция «Как это работает».
 * Липкая «Открыть демо» на телефоне после первого экрана.
 */
export function Landing() {
  const hero = useRef<HTMLElement>(null);
  const lead = useRef<HTMLElement>(null);
  useEffect(() => track("landing_view"), []);
  return (
    <>
      <Hero ref={hero} />
      <Facts />
      <Pains />
      <Tour />
      <How />
      <Bento />
      <CaseBlock />
      <More />
      {VIDEO.url ? <Video /> : null}
      <Start />
      <Faq />
      <Final />
      <Lead ref={lead} />
      <StickyDemo hero={hero} lead={lead} />
    </>
  );
}

/* ------------------------------------------------------------------ 1. Первый экран */

function Hero({ ref }: { ref: React.Ref<HTMLElement> }) {
  const { hero } = LANDING;
  return (
    <section className="relative isolate overflow-hidden">
      <span aria-hidden className="site-glow -z-10" />
      {/* Липкая кнопка телефона следит за этим блоком: появляется, когда кнопки ушли из виду */}
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className="site-wrap flex flex-col items-start pt-6 pb-12 sm:items-center sm:pt-14 sm:text-center lg:pt-20 lg:pb-20"
      >
        <Link
          to="/demo"
          className="site-rise inline-flex min-h-9 items-center gap-2 rounded-full bg-surface px-3.5 text-meta text-text-2 ring-1 ring-line focus-ring is-hover:text-text"
          onClick={() => track("cta_demo", { place: "badge" })}
        >
          <Sparkles className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          {hero.badge}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
        <p className="site-caption site-rise mt-5 font-medium text-text-2">{hero.eyebrow}</p>
        <h1 className="site-h1 site-hero site-rise mt-2 max-w-[18ch] text-text">{hero.title}</h1>
        <p className="site-lead site-rise mt-4 max-w-[640px] text-text-2 lg:mt-6">{hero.lead}</p>
        <div className="site-rise mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:mt-10">
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
      {/* Окно продукта: сам продукт, а не картинка. На телефоне ниже первого экрана */}
      <div className="site-wrap pb-16 lg:pb-28">
        <Reveal delay={200} className="mx-auto max-w-[1040px]">
          <ProductWindow />
          <SampleNote className="mt-3 text-center" />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Общие кирпичи */

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
  dark = false,
  center = false,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
  dark?: boolean;
  center?: boolean;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("site-section", dark ? "site-dark" : "border-t border-line", className)}
    >
      <div className="site-wrap">
        <div className={cn(center && "mx-auto text-center")}>
          {eyebrow ? <p className="site-caption mb-3 font-medium text-text-3">{eyebrow}</p> : null}
          <h2 id={id} className={cn("site-h2 max-w-[24ch] text-text", center && "mx-auto")}>
            {title}
          </h2>
          {lead ? (
            <div className={cn("site-body mt-3 max-w-[640px] text-text-2", center && "mx-auto")}>
              {lead}
            </div>
          ) : null}
        </div>
        <div className="mt-8 lg:mt-12">{children}</div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 2. Факты продукта */

function Facts() {
  return (
    <section aria-label="Факты продукта" className="border-t border-line">
      <dl className="site-wrap grid grid-cols-2 gap-x-4 gap-y-6 py-10 lg:grid-cols-4 lg:py-14">
        {LANDING.facts.map((fact, index) => (
          <Reveal key={fact.label} delay={index * 80} className="flex flex-col gap-1">
            <dt className="site-body order-2 text-text-2">{fact.label}</dt>
            <dd className="site-fact order-1 text-text tnum">{fact.value}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ 3. Знакомо? */

function Pains() {
  const { pains } = LANDING;
  return (
    <Section id="pains" title={pains.title}>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {pains.items.map((item, index) => (
          <Reveal
            as="li"
            key={item}
            delay={index * 80}
            className="flex h-full flex-col gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line lg:p-6"
          >
            <span className="site-caption font-medium text-text-3 tnum">0{index + 1}</span>
            <span className="site-body text-text">{item}</span>
          </Reveal>
        ))}
      </ul>
      <p className="site-caption mt-5 max-w-[640px] text-text-3">{pains.caption}</p>
    </Section>
  );
}

/* ------------------------------------------------------------------ 4. Тур по ролям */

const TOUR_ART: Record<string, ReactNode> = {
  foreman: <BotFragment />,
  manager: <QueueFragment />,
  director: <WeekTableFragment />,
  ask: <AskFragment compact />,
};

function Tour() {
  const { tour } = LANDING;
  const [active, setActive] = useState<string>(tour.tabs[0]!.key);
  const tab = tour.tabs.find((t) => t.key === active) ?? tour.tabs[0]!;
  return (
    <Section id="tour" title={tour.title} lead={tour.lead}>
      <div role="tablist" aria-label="Роли" className="grid grid-cols-2 gap-2 sm:flex">
        {tour.tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tour-tab-${t.key}`}
            aria-selected={t.key === active}
            aria-controls="tour-panel"
            onClick={() => setActive(t.key)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-body-strong transition-colors duration-100 focus-ring",
              t.key === active
                ? "bg-text text-void"
                : "bg-surface text-text-2 ring-1 ring-line ring-inset is-hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id="tour-panel"
        role="tabpanel"
        aria-labelledby={`tour-tab-${tab.key}`}
        className="mt-6 grid grid-cols-1 gap-6 rounded-2xl bg-surface p-5 ring-1 ring-line lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-12 lg:p-10"
      >
        <div>
          <h3 className="site-h3 text-text">{tab.title}</h3>
          <ul className="mt-4 flex flex-col gap-3">
            {tab.points.map((point) => (
              <li key={point} className="site-body flex gap-3 text-text-2">
                <Check className="mt-1 size-4 shrink-0 text-text" strokeWidth={2.25} aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div key={tab.key} className="site-rise rounded-2xl bg-void p-4 ring-1 ring-line sm:p-5">
          {TOUR_ART[tab.key]}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ 5. Как это работает */

function How() {
  const { how } = LANDING;
  return (
    <Section id="how" title={how.title} dark>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {how.steps.map((step, index) => (
          <Reveal
            as="li"
            key={step.title}
            delay={index * 100}
            className="flex h-full flex-col gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line"
          >
            <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-body-strong text-text tnum">
              {index + 1}
            </span>
            <h3 className="site-h3 text-text">{step.title}</h3>
            <p className="site-body text-text-2">{step.text}</p>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------ 6. Возможности сеткой */

const BENTO_ICON: Record<string, typeof Mic> = {
  report: FileSpreadsheet,
  calc: Sigma,
  voice: Mic,
  checks: ScanSearch,
  sources: ShieldCheck,
  audit: History,
};

function Bento() {
  const { bento } = LANDING;
  const [report, calc, ...rest] = bento.items;
  return (
    <Section id="bento" title={bento.title} lead={bento.lead}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
        {[report!, calc!].map((item, index) => {
          const Icon = BENTO_ICON[item.key]!;
          return (
            <Reveal
              key={item.key}
              delay={index * 80}
              className={cn(
                "flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line lg:p-7",
                index === 0 ? "lg:col-span-4" : "lg:col-span-2",
              )}
            >
              <BentoHead icon={Icon} title={item.title} text={item.text} />
              <div className="mt-auto">
                {index === 0 ? <WeekTableFragment /> : <CalcFragment />}
              </div>
            </Reveal>
          );
        })}
        {rest.map((item, index) => {
          const Icon = BENTO_ICON[item.key]!;
          return (
            <Reveal
              key={item.key}
              delay={index * 80}
              className="rounded-2xl bg-surface p-5 ring-1 ring-line lg:col-span-3 lg:p-7"
            >
              <BentoHead icon={Icon} title={item.title} text={item.text} />
            </Reveal>
          );
        })}
      </div>
      <SampleNote className="mt-4" />
    </Section>
  );
}

function BentoHead({ icon: Icon, title, text }: { icon: typeof Mic; title: string; text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <span
        className="grid size-10 place-items-center rounded-full bg-surface-2 text-text"
        aria-hidden
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <h3 className="site-h3 text-text">{title}</h3>
      <p className="site-body text-text-2">{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ 7. Кейс */

function CaseBlock() {
  const { case: item } = LANDING;
  return (
    <Section id="case" eyebrow={CASE_STATUS} title={item.title}>
      <Reveal className="grid gap-6 rounded-2xl bg-surface p-6 ring-1 ring-line lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-12 lg:p-10">
        <p className="site-lead text-text">{item.text}</p>
        <div className="flex flex-col gap-3 lg:items-end">
          <Link to="/case/gas" className={cn(siteButton.secondary, "w-full sm:w-auto")}>
            {item.more}
            <ArrowRight className="size-5" aria-hidden />
          </Link>
        </div>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ 8. Что ещё умеет */

function More() {
  const { more } = LANDING;
  return (
    <Section id="more" title={more.title} lead={more.caption}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {more.items.map((item) => (
          <li key={item}>
            <Link
              to="/demo"
              className="flex h-full min-h-20 items-center gap-3 rounded-2xl bg-surface px-5 py-4 ring-1 ring-line transition-colors duration-100 focus-ring active:bg-surface-2 is-hover:bg-surface-2"
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
          const first = index === 0;
          return (
            <Reveal
              as="li"
              key={step.key}
              delay={index * 80}
              className={cn(
                "flex h-full flex-col gap-2 rounded-2xl p-5 ring-1 lg:p-6",
                first ? "bg-surface ring-text" : "bg-surface ring-line",
              )}
            >
              <span className="site-caption font-medium text-text-3 tnum">
                Шаг {index + 1}
                {first ? " · начните отсюда" : ""}
              </span>
              <h3 className="site-h3 text-text">{step.title}</h3>
              <p className="site-body text-text-2">{step.text}</p>
              {/* Цена только из конфигурации: без значения строки нет вовсе (01_SPEC 13) */}
              {price ? (
                <p className="site-body mt-auto pt-2 font-medium text-text">{price}</p>
              ) : null}
              {first ? (
                <Link
                  to="/razbor"
                  search={{ from: "landing" }}
                  onClick={() => track("cta_razbor", { place: "steps" })}
                  className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-2 text-body-strong text-text underline-offset-4 focus-ring is-hover:underline"
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
      <div className="max-w-[820px] overflow-hidden rounded-2xl bg-surface ring-1 ring-line [&>details+details]:border-t [&>details+details]:border-line">
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

/* ------------------------------------------------------------------ 11. Финальный призыв */

function Final() {
  const { final, hero } = LANDING;
  return (
    <section aria-labelledby="final-title" className="border-t border-line">
      <div className="site-wrap py-16 lg:py-24">
        <div className="flex flex-col items-start gap-6 rounded-3xl bg-surface p-6 ring-1 ring-line sm:items-center sm:p-12 sm:text-center lg:p-16">
          <h2 id="final-title" className="site-h2 max-w-[20ch] text-text">
            {final.title}
          </h2>
          <p className="site-body max-w-[600px] text-text-2">{final.text}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              to="/demo"
              className={siteButton.primary}
              onClick={() => track("cta_demo", { place: "final" })}
            >
              {hero.primary}
              <ArrowRight className="size-5" aria-hidden />
            </Link>
            <a href="#lead" className={siteButton.secondary}>
              Оставить заявку
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 12. Заявка */

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
