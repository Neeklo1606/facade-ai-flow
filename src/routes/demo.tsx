import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SiteError, SiteSkeleton, siteButton } from "@/components/site/parts";
import { useForcedState } from "@/lib/screen-state";
import { DemoScenarioList, useStartCanonScenario } from "@/components/guide/DemoScenarios";
import { useEffect } from "react";
import { restartShow } from "@/lib/guide/store";
import { DEMO } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Вход в демо без регистрации (ADR-047, 01_SPEC 7.1). Главное: показ учёта выработки,
 * «Начать показ» открывает первый шаг сразу. Ниже голос с объекта: три сценария ГАЙКИ,
 * которые раньше жили на экране входа `/`.
 */
export const Route = createFileRoute("/demo")({
  ssr: true,
  validateSearch: (search: Record<string, unknown>): { partner?: "1"; scenario?: string } => ({
    ...(search["partner"] === "1" || search["partner"] === 1 ? { partner: "1" as const } : {}),
    // Сценарий ГАЙКИ из ссылки: касание плитки до загрузки скриптов (DemoScenarioList)
    ...(typeof search["scenario"] === "string" && search["scenario"].startsWith("canon-")
      ? { scenario: search["scenario"] }
      : {}),
  }),
  head: () => siteHead({ path: "/demo", ...DEMO.meta, image: "/og/demo.jpg" }),
  component: DemoEntry,
});

function DemoEntry() {
  const { partner, scenario } = Route.useSearch();
  const navigate = useNavigate();
  const startScenario = useStartCanonScenario();
  useEffect(() => {
    if (scenario) startScenario(scenario);
    // Запуск один раз на адрес: повтор переходом назад запустит заново, и это верно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);
  // Сборка проверки макетов: ?state=loading и ?state=error (ADR-045, 4.17)
  const forced = useForcedState();
  const pickRole = () => {
    // Свой выбор роли: экран выбора откроется поверх рабочего экрана ГАЙКИ
    restartShow();
    void navigate({ to: "/attention" });
  };

  return (
    <SiteLayout>
      <header className="site-wrap pt-8 pb-8 lg:pt-16 lg:pb-12">
        <h1 className="site-h1 text-text">{DEMO.title}</h1>
        <p className="site-lead mt-3 max-w-[640px] text-text-2 lg:mt-5">{DEMO.lead}</p>
      </header>

      {forced === "loading" ? (
        <div className="site-wrap pb-16 lg:pb-28">
          <SiteSkeleton label="Загружаю сценарии показа" />
        </div>
      ) : forced === "error" ? (
        <div className="site-wrap pb-16 lg:pb-28">
          <SiteError
            what="Не удалось открыть сценарии показа"
            onRetry={() => window.location.reload()}
          />
        </div>
      ) : (
        <div className="site-wrap flex flex-col gap-12 pb-16 lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-start lg:gap-10 lg:pb-28">
          <section
            aria-labelledby="demo-gas"
            className="relative isolate overflow-hidden rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-7 lg:p-10"
          >
            <span aria-hidden className="site-glow -z-10 opacity-40" />
            <p className="site-caption font-medium text-orange">Главный сценарий</p>
            <h2 id="demo-gas" className="site-h2 mt-2 text-text">
              {DEMO.gas.title}
            </h2>
            <p className="site-body mt-3 text-text-2">{DEMO.gas.text}</p>
            <p className="site-caption mt-4 text-text-3 tnum">{DEMO.gas.meta}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-8">
              <Link to="/gas" search={{ start: "1" }} className={siteButton.primary}>
                <Play className="size-4 fill-current" aria-hidden />
                {DEMO.gas.start}
              </Link>
              <Link to="/gas" search={{ roles: "1" }} className={siteButton.secondary}>
                {DEMO.gas.roles}
              </Link>
            </div>
          </section>

          <section aria-labelledby="demo-voice" className="flex flex-col gap-4">
            <div>
              <h2 id="demo-voice" className="site-h3 text-text">
                {DEMO.voice.title}
              </h2>
              <p className="site-body mt-1 text-text-2">{DEMO.voice.text}</p>
            </div>
            <DemoScenarioList />
            <button
              type="button"
              onClick={pickRole}
              className="inline-flex min-h-12 items-center gap-2 self-start rounded-full px-1 text-body-strong text-text focus-ring is-hover:text-orange"
            >
              {DEMO.voice.pick}
              <ArrowRight className="size-4" aria-hidden />
            </button>
            {partner ? (
              <Link
                to="/kit"
                className="inline-flex min-h-12 items-center gap-2 self-start rounded-full px-1 text-body text-text-2 focus-ring is-hover:text-text"
              >
                {DEMO.partner}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </section>
        </div>
      )}
    </SiteLayout>
  );
}
