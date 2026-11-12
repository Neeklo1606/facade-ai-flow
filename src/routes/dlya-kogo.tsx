import { loadSiteHead } from "@/lib/site/head-loader";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Monitor, Smartphone, X } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead, SiteSection, siteButton } from "@/components/site/parts";
import { HeroActions, LeadSection, StickyCta } from "@/components/site/blocks";
import { HeroBackdrop } from "@/components/site/growth";
import { AUDIENCE, ROLES } from "@/lib/site/pages";
import { cn } from "@/lib/utils";

/**
 * «Для кого» (ADR-068): пять ролей подрядчика, у каждой было и стало, что делает,
 * чего больше не делает и где это посмотреть в демо. Якорь роли ведёт с главной.
 */
export const Route = createFileRoute("/dlya-kogo")({
  ssr: true,
  loader: () => loadSiteHead("/dlya-kogo"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: AudiencePage,
});

function AudiencePage() {
  return (
    <SiteLayout>
      <section data-hero className="site-page-hero bg-void">
        <HeroBackdrop />
        <SitePageHead
          eyebrow={<span className="site-chip-grad">{AUDIENCE.eyebrow}</span>}
          title={AUDIENCE.title}
          lead={AUDIENCE.lead}
        >
          <HeroActions place="audience" from="audience" />
          <nav aria-label="Роли" className="site-chips-scroll mt-8">
            {ROLES.map((role) => (
              <a
                key={role.key}
                href={`#${role.key}`}
                className="site-filter-chip inline-flex items-center focus-ring"
              >
                {role.title}
              </a>
            ))}
          </nav>
        </SitePageHead>
      </section>

      <div className="site-wrap flex flex-col gap-6 pb-16 lg:gap-8 lg:pb-24">
        {ROLES.map((role) => {
          const Icon = role.where === "Компьютер" ? Monitor : Smartphone;
          return (
            <section
              key={role.key}
              id={role.key}
              aria-labelledby={`${role.key}-title`}
              className="site-glow-card grid grid-cols-1 gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-12 lg:p-10"
              data-reveal
            >
              <div>
                <span className="inline-flex items-center gap-1.5 text-meta text-text-3">
                  <Icon className="size-4" aria-hidden />
                  {AUDIENCE.where}: {role.where}
                </span>
                <h2 id={`${role.key}-title`} className="site-h2 mt-3 text-text">
                  {role.title}
                </h2>
                <dl className="mt-6 flex flex-col gap-4">
                  <div>
                    <dt className="text-meta text-text-3">{AUDIENCE.was}</dt>
                    <dd className="site-body mt-0.5 text-text-2">{role.pain}</dd>
                  </div>
                  <div>
                    <dt className="text-meta text-text-3">{AUDIENCE.now}</dt>
                    <dd className="site-lead mt-0.5 font-medium text-text">{role.gain}</dd>
                  </div>
                </dl>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
                <div>
                  <h3 className="site-h3 text-text">{AUDIENCE.does}</h3>
                  <ul className="mt-3 flex flex-col gap-3">
                    {role.does.map((item) => (
                      <li key={item} className="site-body flex gap-3 text-text-2">
                        <Check className="mt-1 size-4 shrink-0 text-ok" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="site-h3 text-text">{AUDIENCE.stops}</h3>
                  <ul className="mt-3 flex flex-col gap-3">
                    {role.stops.map((item) => (
                      <li key={item} className="site-body flex gap-3 text-text-2">
                        <X className="mt-1 size-4 shrink-0 text-text-3" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="md:col-span-2 lg:col-span-1">
                  <p className="text-meta text-text-3">{AUDIENCE.demo}</p>
                  <Link
                    to="/demo"
                    className={cn(siteButton.secondary, "site-btn-sm site-btn-wrap mt-2")}
                  >
                    {role.demo}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <SiteSection id="industries" title={AUDIENCE.industriesTitle} tone="card">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" data-reveal-group>
          {AUDIENCE.industries.map((item) => (
            <li key={item.title} className="rounded-card bg-void p-5" data-reveal>
              <p className="site-h3 text-text">{item.title}</p>
              <p className="site-body mt-2 text-text-2">{item.text}</p>
            </li>
          ))}
        </ul>
      </SiteSection>

      <LeadSection source="audience" />
      <StickyCta from="audience" />
    </SiteLayout>
  );
}
