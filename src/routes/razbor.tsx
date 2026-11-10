import { loadSiteHead } from "@/lib/site/head-loader";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Check } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead } from "@/components/site/parts";
import { LeadForm } from "@/components/site/landing/LeadForm";
import { contactTgUrl, PRICES, RAZBOR_CREDIT } from "@/lib/site/config";
import { leadMessage, RAZBOR } from "@/lib/site/copy";
import { track } from "@/lib/site/analytics";
import { LEAD_SOURCES, LEAD_TASKS, type LeadSource, type LeadTask } from "@/lib/site/lead-fields";

/**
 * Разбор на данных клиента (01_SPEC 10.2, ADR-067 раздел 6.4): первый шаг для клиента.
 * Что присылаете, что получаете, срок и цена из конфигурации, форма с выбором задачи.
 * Загрузки файлов на сайте нет: после заявки пришлём, куда.
 */
const SOURCE_TASK: Partial<Record<LeadSource, LeadTask>> = {
  "task-time": "time",
  "task-supply": "supply",
  "task-docs": "docs",
  case: "time",
};

export const Route = createFileRoute("/razbor")({
  ssr: true,
  validateSearch: (search: Record<string, unknown>): { from?: LeadSource; task?: LeadTask } => {
    const from = String(search["from"] ?? "");
    const task = String(search["task"] ?? "");
    return {
      ...((LEAD_SOURCES as readonly string[]).includes(from) ? { from: from as LeadSource } : {}),
      ...((LEAD_TASKS as readonly string[]).includes(task) ? { task: task as LeadTask } : {}),
    };
  },
  loader: () => loadSiteHead("/razbor"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: RazborPage,
});

function RazborPage() {
  const { from = "razbor", task } = Route.useSearch();
  const chosen = task ?? SOURCE_TASK[from];
  return (
    <SiteLayout>
      <SitePageHead eyebrow={RAZBOR.eyebrow} title={RAZBOR.title} lead={RAZBOR.lead} />

      <div className="site-wrap grid gap-4 md:grid-cols-2">
        {[RAZBOR.send, RAZBOR.get].map((block, index) => (
          <section
            key={block.title}
            aria-labelledby={`razbor-${index}`}
            className="rounded-surface bg-surface p-6 lg:p-8"
          >
            <h2 id={`razbor-${index}`} className="site-h3 text-text">
              {block.title}
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {block.items.map((item) => (
                <li key={item} className="site-body flex gap-3 text-text-2">
                  <Check
                    className="mt-1 size-4 shrink-0 text-text-3"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section
        id="lead"
        aria-labelledby="razbor-lead"
        className="site-wrap grid gap-10 py-16 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:py-28"
      >
        <div>
          <h2 id="razbor-lead" className="site-h2 text-text">
            {RAZBOR.leadTitle}
          </h2>
          <dl className="mt-6 flex flex-col gap-4">
            <div>
              <dt className="site-caption text-text-3">{RAZBOR.term.label}</dt>
              <dd className="site-body mt-0.5 text-text">{RAZBOR.term.value}</dd>
            </div>
            <div>
              <dt className="site-caption text-text-3">{RAZBOR.priceLabel}</dt>
              <dd className="site-body mt-0.5 text-text">{PRICES.razbor || RAZBOR.price}</dd>
              {RAZBOR_CREDIT ? (
                <dd className="site-caption mt-1 text-text-2">{RAZBOR.credit}</dd>
              ) : null}
            </div>
            <div>
              <dt className="site-caption text-text-3">{RAZBOR.transferLabel}</dt>
              <dd className="site-body mt-0.5 text-text">{RAZBOR.transfer}</dd>
            </div>
          </dl>
          <a
            href={contactTgUrl(leadMessage(from))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("telegram_click", { place: "razbor" })}
            className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-body-strong text-text underline-offset-4 focus-ring is-hover:underline"
          >
            {RAZBOR.telegram}
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
        <LeadForm source={from} {...(chosen ? { task: chosen } : {})} />
      </section>
    </SiteLayout>
  );
}
