import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Monitor, Smartphone } from "lucide-react";
import { CRUMBS, LANDING, TASK_PAGE, TASKS, type TaskCopy } from "@/lib/site/copy";
import { track } from "@/lib/site/analytics";
import { SiteLayout } from "../SiteLayout";
import { Breadcrumbs, SiteSection, StatusBadge } from "../parts";
import { FaqList, HeroActions, LeadSection, StepsSwitcher, StickyCta } from "../blocks";
import { Shot, type ShotId } from "../visuals";

/**
 * Страница задачи (ADR-067, раздел 6): один шаблон, разное содержание, читается за 60 секунд.
 * Хлебная строка, статус и H1, большой снимок, роли, четыре шага, результат, границы,
 * вопросы, заявка с выбранной задачей и ссылки на две другие задачи.
 */
export function TaskPage({
  task,
  hero,
  heroPhone,
  steps,
}: {
  task: TaskCopy;
  hero: ShotId;
  heroPhone?: ShotId;
  steps: readonly [ShotId, ShotId, ShotId, ShotId];
}) {
  useEffect(() => track("task_page_view", { task: task.key }), [task.key]);
  const others = TASKS.filter((item) => item.key !== task.key);
  return (
    <SiteLayout>
      <div className="site-task-page">
        <Breadcrumbs
          items={[{ name: CRUMBS.home, to: "/" }, { name: CRUMBS.tasks }, { name: task.title }]}
        />
        <section data-hero aria-labelledby="task-title" className="site-task-hero bg-void">
          <div className="site-wrap site-task-hero-inner">
            <div className="site-task-hero-copy">
              <StatusBadge kind={task.status.kind} text={task.status.page} />
              <h1 id="task-title" className="site-h1 mt-5 text-text">
                {task.h1}
              </h1>
              <p className="site-lead mt-4 max-w-[640px] text-text-2 lg:mt-6">{task.lead}</p>
              <HeroActions place={`task-${task.key}`} from={task.source} />
            </div>
            <Shot
              id={hero}
              {...(heroPhone ? { phone: heroPhone } : {})}
              priority
              className="site-task-hero-shot"
            />
          </div>
        </section>

        <SiteSection id="roles" title={TASK_PAGE.roles} tone="card">
          <ul className="grid gap-4 md:grid-cols-3" data-reveal-group>
            {task.roles.map((role) => {
              const Icon = role.where === "Телефон" ? Smartphone : Monitor;
              return (
                <li
                  key={role.role}
                  className="flex flex-col gap-2 rounded-card bg-void p-6"
                  data-reveal
                >
                  <h3 className="site-h3 text-text">{role.role}</h3>
                  <p className="site-body text-text-2">{role.does}</p>
                  <p className="mt-auto inline-flex items-center gap-1.5 pt-2 text-meta text-text-3">
                    <Icon className="size-4" aria-hidden />
                    {role.where}
                  </p>
                </li>
              );
            })}
          </ul>
        </SiteSection>

        <SiteSection id="how" title={TASK_PAGE.how}>
          <StepsSwitcher
            steps={task.steps}
            visuals={steps.map((id) => (
              <Shot key={id} id={id} />
            ))}
            place={`task-${task.key}`}
          />
        </SiteSection>

        <SiteSection id="get" title={TASK_PAGE.get} tone="card">
          <ul className="grid gap-4 sm:grid-cols-2" data-reveal-group>
            {task.get.map((item) => (
              <li key={item} className="site-result rounded-card bg-void p-6" data-reveal>
                <span className="site-h3 text-text">{item}</span>
              </li>
            ))}
          </ul>
        </SiteSection>

        <SiteSection id="limits" title={TASK_PAGE.not}>
          <ul className="flex max-w-[760px] flex-col gap-4" data-reveal-group>
            {task.not.map((item) => (
              <li key={item} className="site-body flex gap-3 text-text-2" data-reveal>
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-text-3" />
                {item}
              </li>
            ))}
          </ul>
        </SiteSection>

        <SiteSection id="faq" title={TASK_PAGE.faq} tone="card">
          <FaqList items={task.faq} place={`task-${task.key}`} />
        </SiteSection>

        <LeadSection
          source={task.source}
          task={task.key}
          title={TASK_PAGE.lead}
          text={TASK_PAGE.leadText}
        />

        <section aria-labelledby="others-title" className="site-block bg-void">
          <div className="site-wrap">
            <h2 id="others-title" className="site-h2 text-text">
              {TASK_PAGE.others}
            </h2>
            <ul className="site-block-body grid gap-4 md:grid-cols-3">
              {others.map((item) => (
                <li key={item.key}>
                  <Link
                    to={item.path}
                    className="flex min-h-full flex-col gap-2 rounded-card bg-surface p-6 focus-ring is-hover:shadow-[var(--shadow-card)]"
                  >
                    <span className="site-h3 text-text">{item.title}</span>
                    <span className="site-body text-text-2">{item.after}</span>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-body-strong text-text">
                      {LANDING.tasks.more}
                      <ArrowRight className="size-4" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to="/case/gas"
                  className="flex min-h-full flex-col gap-2 rounded-card bg-surface p-6 focus-ring"
                >
                  <span className="site-h3 text-text">{TASK_PAGE.case}</span>
                  <span className="site-body text-text-2">{LANDING.case.text}</span>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-body-strong text-text">
                    {LANDING.case.link}
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </section>
        <StickyCta from={task.source} />
      </div>
    </SiteLayout>
  );
}
