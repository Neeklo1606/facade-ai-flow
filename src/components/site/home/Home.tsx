import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { CASE_STATUS, PRICES } from "@/lib/site/config";
import { LANDING, TASKS } from "@/lib/site/copy";
import { track } from "@/lib/site/analytics";
import { cn } from "@/lib/utils";
import { siteButton, SiteSection } from "../parts";
import { FaqList, LeadSection, StepsSwitcher, StickyCta, TaskCard } from "../blocks";
import { HeroLive } from "../landing/hero-live";
import { HeroForm } from "../landing/hero-form";
import { Shot, type ShotId } from "../visuals";
import { AUDIENCE, ARTICLES_PAGE } from "@/lib/site/pages";
import { ArticleGrid, CapabilityMarquee, LATEST_ARTICLES, RoleCards } from "../growth";

/**
 * Главная сайта v2 (ADR-067, раздел 5): первый экран, три задачи, путь из четырёх шагов,
 * что меняется для офиса, контроль, кейс, как начать, вопросы, заявка. Порядок и тексты
 * из постановки владельца 11.11.2026, обещания сверены с docs/site/CAPABILITIES.md.
 */
const TASK_VISUAL: Record<string, ShotId> = {
  time: "time-review",
  supply: "supply-offers",
  docs: "docs-act",
};

const HOW_VISUALS: readonly ShotId[] = ["time-brigade", "time-review", "time-week", "time-tabel"];

export function Home() {
  useEffect(() => track("landing_view"), []);
  return (
    <div className="site-home">
      <Hero />
      <CapabilityMarquee />
      <Tasks />
      <Roles />
      <How />
      <Compare />
      <Office />
      <Control />
      <Case />
      <Start />
      <SiteSection id="faq" title={LANDING.faq.title} tone="card">
        <FaqList items={LANDING.faq.items} place="landing" />
      </SiteSection>
      <SiteSection id="articles" title={ARTICLES_PAGE.homeTitle} lead={ARTICLES_PAGE.homeLead}>
        <ArticleGrid items={LATEST_ARTICLES} />
        <Link to="/stati" className={cn(siteButton.secondary, "mt-8")}>
          {ARTICLES_PAGE.back}
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      </SiteSection>
      <LeadSection source="landing" />
      <StickyCta />
    </div>
  );
}

function Hero() {
  const { hero } = LANDING;
  return (
    <section data-hero aria-labelledby="hero-title" className="site-hero site-hero-warm">
      <CharField />
      <div className="site-wrap site-hero-inner">
        <div className="site-hero-copy">
          <p className="site-hero-eyebrow">{hero.eyebrow}</p>
          <h1 id="hero-title" className="site-h1 site-hero-title">
            {hero.title}
          </h1>
          <p className="site-lead site-hero-lead site-only-desk">{hero.lead}</p>
          <p className="site-lead site-hero-lead site-only-phone">{hero.leadShort}</p>
        </div>
        <HeroForm />
        <div className="site-hero-visual">
          <HeroLive />
        </div>
      </div>
    </section>
  );
}

/**
 * Сетка символов первого экрана (CharField): декор текстом в псевдоэлементе CSS, без скриптов
 * и картинок. Строки сдвигаются на символ, к краю сетка проявляется маской
 */
const CHAR_SET = ["=", "+", "0", "a", "k", "b", "d", "h", "W", "#", "M", "&", "$"];
const CHAR_FIELD = Array.from({ length: 28 }, (_, row) =>
  Array.from({ length: 34 }, (_, col) => {
    const at = Math.floor((col + row) / 2);
    return CHAR_SET[Math.min(at, CHAR_SET.length - 1)];
  }).join(" "),
).join("\n");

function CharField() {
  return <div aria-hidden className="site-chars" data-chars={CHAR_FIELD} />;
}

/** Сравнение с Excel и чатом: таблица на компьютере, карточки строк на телефоне */
function Compare() {
  const { compare } = LANDING;
  return (
    <SiteSection id="compare" title={compare.title} lead={compare.lead}>
      <div className="site-compare" data-reveal>
        <table className="site-compare-table">
          <thead>
            <tr>
              <th scope="col">{compare.head.what}</th>
              <th scope="col">{compare.head.old}</th>
              <th scope="col">{compare.head.gaika}</th>
            </tr>
          </thead>
          <tbody>
            {compare.rows.map((row) => (
              <tr key={row.what}>
                <th scope="row">{row.what}</th>
                <td data-label={compare.head.old}>{row.old}</td>
                <td data-label={compare.head.gaika} className="is-gaika">
                  {row.gaika}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SiteSection>
  );
}

function Roles() {
  return (
    <SiteSection
      id="roles"
      title={AUDIENCE.homeTitle}
      lead={AUDIENCE.homeLead}
      className="site-band"
    >
      <RoleCards />
    </SiteSection>
  );
}

function Tasks() {
  return (
    <SiteSection
      id="tasks"
      title={LANDING.tasks.title}
      tone="card"
      headingClassName="max-w-[900px]"
    >
      <ul className="site-task-grid" data-reveal-group>
        {TASKS.map((task) => (
          <TaskCard
            key={task.key}
            task={task}
            visual={
              <Shot
                id={TASK_VISUAL[task.key]!}
                caption={false}
                sizes="(min-width: 1024px) 380px, 100vw"
              />
            }
          />
        ))}
      </ul>
      <p className="site-caption mt-4 text-text-3">Снимки из демо, данные вымышленные.</p>
    </SiteSection>
  );
}

function How() {
  return (
    <SiteSection id="how" title={LANDING.how.title}>
      <StepsSwitcher
        steps={LANDING.how.steps}
        visuals={HOW_VISUALS.map((id) => (
          <Shot key={id} id={id} />
        ))}
        place="landing"
      />
    </SiteSection>
  );
}

function Office() {
  return (
    <SiteSection id="office" title={LANDING.office.title} tone="card">
      <ul className="grid gap-4 md:grid-cols-3" data-reveal-group>
        {LANDING.office.items.map((item) => (
          <li key={item} className="site-body rounded-card bg-surface p-6 text-text" data-reveal>
            {item}
          </li>
        ))}
      </ul>
    </SiteSection>
  );
}

function Control() {
  const { control } = LANDING;
  return (
    <SiteSection id="control" title={control.title}>
      <div className="grid gap-4 md:grid-cols-2" data-reveal-group>
        {[control.gaika, control.human].map((column, index) => (
          <div
            key={column.title}
            className={cn(
              "rounded-surface p-6 lg:p-8",
              index === 0 ? "bg-surface" : "mono-card-inverse",
            )}
            data-reveal
          >
            <h3 className="site-h3">{column.title}</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {column.items.map((item) => (
                <li key={item} className="site-body flex items-baseline gap-3">
                  <span
                    aria-hidden
                    className="mt-2 size-1.5 shrink-0 self-start rounded-full bg-current opacity-60"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SiteSection>
  );
}

function Case() {
  const { case: item } = LANDING;
  return (
    <SiteSection id="case" title={item.title} tone="card">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1fr] lg:gap-16" data-reveal-group>
        <div data-reveal>
          <p className="site-caption font-medium text-text-2">{CASE_STATUS}</p>
          <p className="site-body mt-3 max-w-[560px] text-text">{item.text}</p>
          <Link to="/case/gas" className={cn(siteButton.secondary, "mt-6")}>
            {item.link}
            <ArrowRight className="size-5" aria-hidden />
          </Link>
        </div>
        <div data-reveal>
          <Shot id="time-tabel" />
        </div>
      </div>
    </SiteSection>
  );
}

function Start() {
  const { start } = LANDING;
  return (
    <SiteSection id="start" title={start.title}>
      <ol className="grid gap-4 md:grid-cols-3" data-reveal-group>
        {start.steps.map((step, index) => (
          <li key={step.title} className="flex gap-4 rounded-card bg-surface p-6" data-reveal>
            <span aria-hidden className="site-step-num tnum">
              {index + 1}
            </span>
            <p className="site-body text-text-2">
              <span className="font-medium text-text">{step.title}.</span> {step.text}
              <span className="mt-2 block text-text-3">{step.who}</span>
            </p>
          </li>
        ))}
      </ol>
      <p className="site-body mt-6 text-text" data-price>
        {PRICES.pilot ? start.price(PRICES.pilot) : start.noPrice}
      </p>
    </SiteSection>
  );
}
