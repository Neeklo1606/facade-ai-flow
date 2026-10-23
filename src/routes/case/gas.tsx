import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead, siteButton } from "@/components/site/parts";
import { CASE_CLIENT_NAME, CASE_STATUS } from "@/lib/site/config";
import { CASE, NAV } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Кейс газового подрядчика (01_SPEC 10.1): одностраничник для пересылки, читается за минуту.
 * Название заказчика только из VITE_CASE_CLIENT_NAME, цифр эффекта нет.
 */
export const Route = createFileRoute("/case/gas")({
  ssr: true,
  head: () => siteHead({ path: "/case/gas", ...CASE.meta, image: "/og/case.jpg" }),
  component: CasePage,
});

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-line py-8 lg:grid-cols-[240px_1fr] lg:gap-12 lg:py-10">
      <h2 className="site-h3 text-text">{title}</h2>
      <div className="max-w-[640px]">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item} className="site-body flex gap-3 text-text-2">
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
      <SitePageHead eyebrow={eyebrow} title={CASE.title} lead={CASE.lead}>
        <CaseActions />
      </SitePageHead>
      <div className="site-wrap pb-16 lg:pb-28">
        <Block title={CASE.task.title}>
          <p className="site-body text-text-2">{CASE.task.text}</p>
        </Block>
        <Block title={CASE.before.title}>
          <Bullets items={CASE.before.items} />
        </Block>
        <Block title={CASE.done.title}>
          <Bullets items={CASE.done.items} />
        </Block>
        <Block title={CASE.roles.title}>
          <dl className="flex flex-col gap-3">
            {CASE.roles.items.map((item) => (
              <div key={item.role} className="site-body">
                <dt className="inline font-medium text-text">{item.role}</dt>{" "}
                <dd className="inline text-text-2">{item.text}</dd>
              </div>
            ))}
          </dl>
        </Block>
        <Block title={CASE.next.title}>
          <p className="site-body text-text-2">{CASE.next.text}</p>
          <CaseActions />
        </Block>
      </div>
    </SiteLayout>
  );
}

function CaseActions() {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Link to="/demo" className={siteButton.primary}>
        {NAV.demo}
        <ArrowRight className="size-5" aria-hidden />
      </Link>
      <Link to="/razbor" search={{ from: "case" }} className={siteButton.secondary}>
        {NAV.razbor}
      </Link>
    </div>
  );
}
