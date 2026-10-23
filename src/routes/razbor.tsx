import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Check } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead } from "@/components/site/parts";
import { LeadForm } from "@/components/site/landing/LeadForm";
import { contactTgUrl, PRICES, RAZBOR_CREDIT } from "@/lib/site/config";
import { leadMessage, RAZBOR } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";
import { LEAD_SOURCES, type LeadSource } from "@/lib/site/lead-fields";

/**
 * Экспресс-разбор (01_SPEC 10.2): первая маленькая оплата и заявка на неё. Цена и зачёт
 * в пилот только из конфигурации. Загрузки файлов на сайте нет: после заявки пришлём, куда.
 */
export const Route = createFileRoute("/razbor")({
  ssr: true,
  validateSearch: (search: Record<string, unknown>): { from?: LeadSource } => {
    const from = String(search["from"] ?? "");
    return (LEAD_SOURCES as readonly string[]).includes(from) ? { from: from as LeadSource } : {};
  },
  head: () => siteHead({ path: "/razbor", ...RAZBOR.meta, image: "/og/razbor.jpg" }),
  component: RazborPage,
});

function RazborPage() {
  const { from = "razbor" } = Route.useSearch();
  return (
    <SiteLayout>
      <SitePageHead title={RAZBOR.title} lead={RAZBOR.lead} />

      <div className="site-wrap grid gap-4 sm:grid-cols-2">
        {[RAZBOR.send, RAZBOR.get].map((block, index) => (
          <section
            key={block.title}
            aria-labelledby={`razbor-${index}`}
            className="rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-7"
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
        aria-labelledby="razbor-lead"
        className="site-wrap grid gap-8 py-16 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:py-28"
      >
        <div>
          <h2 id="razbor-lead" className="site-h2 text-text">
            Заявка на разбор
          </h2>
          <dl className="mt-5 flex flex-col gap-3">
            <div>
              <dt className="site-caption text-text-3">Стоимость</dt>
              <dd className="site-body mt-0.5 text-text">{PRICES.razbor || RAZBOR.price}</dd>
              {RAZBOR_CREDIT ? (
                <dd className="site-caption mt-1 text-text-2">{RAZBOR.credit}</dd>
              ) : null}
            </div>
            <div>
              <dt className="site-caption text-text-3">Как передать данные</dt>
              <dd className="site-body mt-0.5 text-text">{RAZBOR.transfer}</dd>
            </div>
          </dl>
          <a
            href={contactTgUrl(leadMessage(from))}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-body-strong text-text underline-offset-4 focus-ring is-hover:underline"
          >
            Или напишите в Telegram
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
        <LeadForm source={from} />
      </section>
    </SiteLayout>
  );
}
