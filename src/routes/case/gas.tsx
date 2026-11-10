import { loadSiteHead } from "@/lib/site/head-loader";
import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead, SiteSection } from "@/components/site/parts";
import { HeroActions, LeadSection, StickyCta } from "@/components/site/blocks";
import { Shot } from "@/components/site/visuals";
import { CASE_CLIENT_NAME, CASE_STATUS } from "@/lib/site/config";
import { CASE } from "@/lib/site/copy";

/**
 * Кейс газового подрядчика (01_SPEC 10.1, ADR-067 раздел 6.4): текст прежний, вид шаблона
 * страницы задачи. Название заказчика только из VITE_CASE_CLIENT_NAME, цифр эффекта нет.
 */
export const Route = createFileRoute("/case/gas")({
  ssr: true,
  loader: () => loadSiteHead("/case/gas"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: CasePage,
});

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex max-w-[760px] flex-col gap-4" data-reveal-group>
      {items.map((item) => (
        <li key={item} className="site-body flex gap-3 text-text-2" data-reveal>
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-text-3" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function CasePage() {
  const eyebrow = CASE_CLIENT_NAME ? `${CASE_CLIENT_NAME} · ${CASE_STATUS}` : CASE_STATUS;
  return (
    <SiteLayout>
      <section data-hero className="bg-void">
        <SitePageHead eyebrow={eyebrow} title={CASE.title} lead={CASE.lead}>
          <HeroActions place="case" from="case" />
        </SitePageHead>
        <div className="site-wrap pb-16 lg:pb-28">
          <Shot id="time-week" phone="time-brigade" priority />
        </div>
      </section>
      <SiteSection id="case-task" title={CASE.task.title} tone="card">
        <p className="site-body max-w-[760px] text-text-2">{CASE.task.text}</p>
      </SiteSection>
      <SiteSection id="case-before" title={CASE.before.title}>
        <Bullets items={CASE.before.items} />
      </SiteSection>
      <SiteSection id="case-done" title={CASE.done.title} tone="card">
        <Bullets items={CASE.done.items} />
      </SiteSection>
      <SiteSection id="case-roles" title={CASE.roles.title}>
        <ul className="grid gap-4 md:grid-cols-2" data-reveal-group>
          {CASE.roles.items.map((item) => (
            <li key={item.role} className="rounded-card bg-surface p-6" data-reveal>
              <h3 className="site-h3 text-text">{item.role}</h3>
              <p className="site-body mt-1 text-text-2">{item.text}</p>
            </li>
          ))}
        </ul>
      </SiteSection>
      <SiteSection id="case-next" title={CASE.next.title} tone="card">
        <p className="site-body max-w-[760px] text-text-2">{CASE.next.text}</p>
      </SiteSection>
      <LeadSection source="case" task="time" />
      <StickyCta from="case" />
    </SiteLayout>
  );
}
