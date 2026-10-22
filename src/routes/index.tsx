import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { demoShow } from "@/api/config";
import { useCurrentRole } from "@/lib/project-scope";
import { homeRouteFor } from "@/lib/navigation";
import { SiteLayout } from "@/components/site/SiteLayout";
import { siteButton } from "@/components/site/parts";
import { LANDING } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Корень адреса (ADR-047). В демо-сборке это лендинг ГАЙКИ: сайт, а не приложение,
 * отрисованный на сервере. Вход в демо переехал на `/demo`.
 *
 * В рабочем контуре сайта нет: корень по-прежнему дверь на рабочий экран роли (ADR-028).
 * Прежний дашборд живёт на `/attention`.
 */
export const Route = createFileRoute("/")({
  ssr: demoShow,
  head: () => siteHead({ path: "/", ...LANDING.meta }),
  component: Home,
});

function Home() {
  if (!demoShow) return <WorkHome />;
  return (
    <SiteLayout>
      <Landing />
    </SiteLayout>
  );
}

function WorkHome() {
  const role = useCurrentRole();
  return <Navigate to={homeRouteFor(role)} replace />;
}

function Landing() {
  const { hero, how } = LANDING;
  return (
    <>
      <section className="relative isolate overflow-hidden">
        <span aria-hidden className="site-glow -z-10" />
        <div className="site-wrap pt-8 pb-16 lg:pt-24 lg:pb-28">
          <p className="site-caption site-rise font-medium text-text-2">{hero.eyebrow}</p>
          <h1 className="site-h1 site-rise mt-3 max-w-[14ch] text-text lg:mt-5">{hero.title}</h1>
          <p className="site-lead site-rise mt-4 max-w-[640px] text-text-2 lg:mt-6">{hero.lead}</p>
          <div className="site-rise mt-8 flex flex-col gap-3 sm:flex-row lg:mt-10">
            <Link to="/demo" className={siteButton.primary}>
              {hero.primary}
              <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link to="/razbor" search={{ from: "landing" }} className={siteButton.secondary}>
              {hero.secondary}
            </Link>
          </div>
          <p className="site-caption site-rise mt-4 text-text-3">{hero.note}</p>
        </div>
      </section>

      <section aria-labelledby="how-title" className="site-section border-t border-line">
        <div className="site-wrap">
          <h2 id="how-title" className="site-h2 text-text">
            {how.title}
          </h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line lg:mt-12 lg:grid-cols-4">
            {how.steps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-2 bg-surface p-5 lg:p-7">
                <span className="site-caption font-medium text-orange tnum">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="site-h3 text-text">{step.title}</h3>
                <p className="site-body text-text-2">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row lg:mt-14">
            <Link to="/demo" className={siteButton.primary}>
              {hero.primary}
              <ArrowRight className="size-5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
