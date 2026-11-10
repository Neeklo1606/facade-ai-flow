import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { contactTgUrl } from "@/lib/site/config";
import {
  LANDING,
  leadMessage,
  NAV,
  SAMPLE_NOTE,
  type FaqItem,
  type TaskCopy,
} from "@/lib/site/copy";
import type { LeadSource, LeadTask } from "@/lib/site/lead-fields";
import { track } from "@/lib/site/analytics";
import { cn } from "@/lib/utils";
import { siteButton, StatusBadge } from "./parts";
import { LeadForm } from "./landing/LeadForm";

/**
 * Блоки страниц сайта v2 (ADR-067): вопросы, путь из четырёх шагов, заявка, карточка задачи,
 * липкая кнопка телефона. Общие для главной и страниц задач.
 */

/** Две кнопки первого экрана: «Показать на моём процессе» и «Посмотреть демо» (раздел 4) */
export function HeroActions({ place, from }: { place: string; from?: LeadSource }) {
  return (
    <div className="site-hero-actions mt-7 flex flex-col gap-3 sm:flex-row">
      <Link
        to="/razbor"
        search={from ? { from } : {}}
        className={siteButton.primary}
        data-cta="razbor"
        onClick={() => track("cta_razbor", { place })}
      >
        {NAV.primary}
        <ArrowRight className="size-5" aria-hidden />
      </Link>
      <Link
        to="/demo"
        className={siteButton.secondary}
        data-cta="demo"
        onClick={() => track("cta_demo", { place })}
      >
        {NAV.demo}
      </Link>
    </div>
  );
}

/** Подпись под фрагментом или снимком: откуда данные (раздел 7.1) */
export function SampleCaption({ className }: { className?: string }) {
  return <p className={cn("site-caption mt-3 text-text-3", className)}>{SAMPLE_NOTE}</p>;
}

/** Вопросы аккордеоном details/summary: работает и без скриптов (раздел 5.9) */
export function FaqList({ items, place }: { items: readonly FaqItem[]; place: string }) {
  return (
    <div className="site-faq flex flex-col gap-3" data-faq>
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-card bg-surface"
          data-reveal
          onToggle={(event) => {
            if ((event.currentTarget as HTMLDetailsElement).open)
              track("faq_open", { place, q: item.q.slice(0, 60) });
          }}
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 rounded-card px-5 py-4 focus-ring lg:px-6 [&::-webkit-details-marker]:hidden">
            <span className="site-body min-w-0 flex-1 font-medium text-text" data-faq-q>
              {item.q}
            </span>
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-text-2 transition-transform duration-150 group-open:rotate-45"
            >
              <Plus className="size-4" />
            </span>
          </summary>
          <p className="site-body max-w-[640px] px-5 pb-5 text-text-2 lg:px-6" data-faq-a>
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}

/**
 * Путь из четырёх шагов (раздел 5.4 и 6): на компьютере шаги переключаются кнопками и
 * стрелками, снимок меняется кроссфейдом 240 мс; на телефоне шаги идут столбиком, у каждого
 * свой снимок. Автопрокрутки нет
 */
export function StepsSwitcher({
  steps,
  visuals,
  place,
}: {
  steps: readonly { title: string; text: string }[];
  visuals: readonly ReactNode[];
  place: string;
}) {
  const [active, setActive] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (index: number, focus = false) => {
    setActive(index);
    if (focus) tabs.current[index]?.focus();
    track("workflow_step_select", { place, step: index + 1 });
  };
  const onKey = (event: React.KeyboardEvent, index: number) => {
    const last = steps.length - 1;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  };
  return (
    <>
      {/* Компьютер: вкладки слева, снимок справа */}
      <div className="site-steps-desktop grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-12">
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Шаги"
          className="flex flex-col gap-2"
        >
          {steps.map((step, index) => (
            <button
              key={step.title}
              ref={(el) => {
                tabs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-selected={active === index}
              aria-controls={`${id}-panel`}
              tabIndex={active === index ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => onKey(event, index)}
              className={cn(
                "site-step-tab flex gap-4 rounded-card px-5 py-5 text-left focus-ring",
                active === index ? "bg-surface" : "is-hover:bg-surface",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-meta-strong tnum",
                  active === index ? "bg-text text-void" : "bg-surface-2 text-text-2",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="site-h3 block text-text">{step.title}</span>
                <span className="site-body mt-1 block text-text-2">{step.text}</span>
              </span>
            </button>
          ))}
        </div>
        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${active}`}
          className="site-step-stage"
        >
          {visuals.map((visual, index) => (
            <div
              key={index}
              className="site-step-visual"
              data-active={active === index ? "" : undefined}
              aria-hidden={active !== index}
              inert={active !== index}
            >
              {visual}
            </div>
          ))}
        </div>
      </div>
      {/* Телефон и планшет: шаги столбиком, у каждого свой снимок */}
      <ol className="site-steps-mobile flex-col gap-10" data-reveal-group>
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-4" data-reveal>
            <div className="flex gap-4">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-text text-meta-strong text-void tnum"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="site-h3 text-text">{step.title}</h3>
                <p className="site-body mt-1 text-text-2">{step.text}</p>
              </div>
            </div>
            <div>{visuals[index]}</div>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Карточка задачи на главной (раздел 5.3): вся карточка нажимается, внутри одна ссылка */
export function TaskCard({ task, visual }: { task: TaskCopy; visual: ReactNode }) {
  const { tasks } = LANDING;
  return (
    <li
      className="site-task-card group relative flex flex-col rounded-surface bg-surface"
      data-reveal
    >
      <div className="flex flex-1 flex-col gap-4 p-6 lg:p-8">
        <StatusBadge kind={task.status.kind} text={task.status.card} className="self-start" />
        <h3 className="site-h3 text-text">
          <Link
            to={task.path}
            onClick={() => track("task_card_click", { task: task.key })}
            className="site-card-link focus-ring"
          >
            {task.title}
          </Link>
        </h3>
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-meta text-text-3">{tasks.before}</dt>
            <dd className="site-body mt-0.5 text-text-2">{task.before}</dd>
          </div>
          <div>
            <dt className="text-meta text-text-3">{tasks.after}</dt>
            <dd className="site-body mt-0.5 font-medium text-text">{task.after}</dd>
          </div>
        </dl>
        <span
          aria-hidden
          className="mt-auto inline-flex items-center gap-1.5 pt-2 text-body-strong text-text"
        >
          {tasks.more}
          <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-1" />
        </span>
      </div>
      <div className="site-task-visual px-4 pb-4 lg:px-5 lg:pb-5">{visual}</div>
    </li>
  );
}

/** Заявка (раздел 5.10): заголовок, текст, Telegram и форма с выбранной задачей */
export function LeadSection({
  source,
  task,
  title = LANDING.lead.title,
  text = LANDING.lead.text,
}: {
  source: LeadSource;
  task?: LeadTask;
  title?: string;
  text?: string;
}) {
  return (
    <section
      id="lead"
      aria-labelledby="lead-title"
      className="site-block site-lead-block bg-surface"
    >
      <div className="site-wrap grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <h2 id="lead-title" className="site-h2 text-text">
            {title}
          </h2>
          <p className="site-body mt-3 max-w-[520px] text-text-2">{text}</p>
          <a
            href={contactTgUrl(leadMessage(source))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("telegram_click", { place: source })}
            className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-body-strong text-text underline-offset-4 focus-ring is-hover:underline"
          >
            {LANDING.lead.telegram}
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
        <LeadForm source={source} {...(task ? { task } : {})} />
      </div>
    </section>
  );
}

/**
 * Липкая кнопка телефона (раздел 10): «Показать на моём процессе» после первого экрана,
 * прячется над формой и подвалом, учитывает safe-area
 */
export function StickyCta({ from }: { from?: LeadSource }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.querySelector("[data-hero]");
    const blockers = Array.from(document.querySelectorAll("#lead, .site-footer"));
    const seen = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
      setHidden([...seen.values()].some(Boolean));
    });
    for (const el of [hero, ...blockers]) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className="site-sticky fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden"
      data-hidden={hidden ? "" : undefined}
      aria-hidden={hidden || undefined}
    >
      <Link
        to="/razbor"
        search={from ? { from } : {}}
        tabIndex={hidden ? -1 : undefined}
        onClick={() => track("cta_razbor", { place: "sticky" })}
        className={cn(siteButton.primary, "site-sticky-button w-full")}
      >
        {NAV.primary}
        <ArrowRight className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
