import { loadSiteHead } from "@/lib/site/head-loader";
import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead, SiteSection } from "@/components/site/parts";
import { FaqList, HeroActions, LeadSection, StickyCta } from "@/components/site/blocks";
import { HeroBackdrop, RecordChain } from "@/components/site/growth";
import { Shot, type ShotId } from "@/components/site/visuals";
import { HOW_IT_WORKS } from "@/lib/site/pages";

/**
 * «Как работает» (ADR-068): путь записи из пяти шагов, пять сценариев по ролям со снимком
 * настоящего экрана демо, как проходит пилот, вопросы и заявка.
 */
export const Route = createFileRoute("/kak-rabotaet")({
  ssr: true,
  loader: () => loadSiteHead("/kak-rabotaet"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: HowPage,
});

function HowPage() {
  const page = HOW_IT_WORKS;
  return (
    <SiteLayout>
      <section data-hero className="site-page-hero bg-void">
        <HeroBackdrop />
        <SitePageHead
          eyebrow={<span className="site-chip-grad">{page.eyebrow}</span>}
          title={page.title}
          lead={page.lead}
        >
          <HeroActions place="how" from="how" />
        </SitePageHead>
      </section>

      <SiteSection id="chain" title={page.chainTitle} tone="card">
        <RecordChain />
      </SiteSection>

      <SiteSection id="scenarios" title={page.scenariosTitle}>
        <div className="flex flex-col gap-6 lg:gap-10">
          {page.scenarios.map((item, index) => (
            <article
              key={item.id}
              id={item.id}
              aria-labelledby={`${item.id}-title`}
              className="site-glow-card grid grid-cols-1 items-center gap-8 p-6 md:p-8 lg:grid-cols-2 lg:gap-12 lg:p-10"
              data-reveal
            >
              <div className={index % 2 ? "lg:order-2" : undefined}>
                <p className="site-chip-grad">{item.role}</p>
                <h3 id={`${item.id}-title`} className="site-h2 mt-4 text-text">
                  {item.title}
                </h3>
                <ol className="mt-6 flex flex-col gap-4">
                  {item.steps.map((step, n) => (
                    <li key={step} className="flex gap-4">
                      <span className="site-step-num tnum" aria-hidden>
                        {n + 1}
                      </span>
                      <p className="site-body pt-1.5 text-text-2">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <Shot id={item.shot as ShotId} sizes="(min-width: 1024px) 560px, 100vw" />
            </article>
          ))}
        </div>
      </SiteSection>

      <SiteSection
        id="pilot"
        title={page.pilotTitle}
        lead={page.pilotNote}
        tone="card"
        className="site-dark site-band"
      >
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-reveal-group>
          {page.pilot.map((step) => (
            <li key={step.title} className="site-glow-card p-6" data-reveal>
              <p className="site-grad-text site-h3">{step.title}</p>
              <p className="site-body mt-2 text-text-2">{step.text}</p>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteSection id="faq" title="Вопросы">
        <FaqList items={page.faq} place="how" />
      </SiteSection>

      <LeadSection source="how" />
      <StickyCta from="how" />
    </SiteLayout>
  );
}
