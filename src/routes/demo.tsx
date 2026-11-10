import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { useEffect } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import {
  SiteError,
  SitePageHead,
  SiteSkeleton,
  siteButton,
  StatusBadge,
} from "@/components/site/parts";
import { useForcedState } from "@/lib/screen-state";
import { DemoScenarioList, useStartCanonScenario } from "@/components/guide/DemoScenarios";
import { restartShow } from "@/lib/guide/store";
import { DEMO, TASKS } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";
import { track } from "@/lib/site/analytics";
import { cn } from "@/lib/utils";

/**
 * Вход в демо без регистрации (ADR-047, ADR-067 раздел 6.4): шапка и подвал сайта, три плитки
 * задач. Учёт времени открывает показ /gas, снабжение и документы открывают свои экраны демо
 * под нужной ролью. «Войти как» строкой, ниже голос с объекта: три сценария ГАЙКИ.
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

/**
 * Куда ведёт плитка: показ учёта времени или выбор роли с готовым экраном. Снабжение
 * открывает экран прораба, документы экран ПТО (ADR-057, ADR-058): роль выбирается на /gas
 */
const TILE_LINK = {
  time: { to: "/gas", search: { start: "1" } },
  supply: { to: "/gas", search: { roles: "1" } },
  docs: { to: "/gas", search: { roles: "1" } },
} as const;

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
      <SitePageHead title={DEMO.title} lead={DEMO.lead} />

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
        <>
          <div className="site-wrap">
            <ul className="grid gap-4 lg:grid-cols-3">
              {TASKS.map((task) => {
                const tile = DEMO.tiles[task.key];
                const link = TILE_LINK[task.key];
                const main = task.key === "time";
                return (
                  <li key={task.key}>
                    <section
                      aria-labelledby={`demo-${task.key}`}
                      className="flex h-full flex-col gap-4 rounded-surface bg-surface p-6 lg:p-8"
                    >
                      <StatusBadge
                        kind={task.status.kind}
                        text={task.status.card}
                        className="self-start"
                      />
                      <h2 id={`demo-${task.key}`} className="site-h3 text-text">
                        {task.title}
                      </h2>
                      <p className="site-body text-text-2">{tile.text}</p>
                      {main ? (
                        <p className="site-caption text-text-3 tnum">{DEMO.gas.meta}</p>
                      ) : null}
                      <Link
                        to={link.to}
                        search={link.search}
                        onClick={() => track("demo_start", { task: task.key })}
                        className={cn(main ? siteButton.primary : siteButton.secondary, "mt-auto")}
                      >
                        {main ? <Play className="size-4 fill-current" aria-hidden /> : null}
                        {tile.open}
                      </Link>
                    </section>
                  </li>
                );
              })}
            </ul>
            <p className="site-body mt-6 text-text-2">
              <Link
                to="/gas"
                search={{ roles: "1" }}
                className="inline-flex min-h-11 items-center gap-1.5 font-medium text-text underline-offset-4 focus-ring is-hover:underline"
              >
                {DEMO.roles}: бригадир, менеджер, прораб, снабженец, ПТО, руководитель
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </p>
          </div>

          <section aria-labelledby="demo-voice" className="site-block bg-void">
            <div className="site-wrap flex max-w-[760px] flex-col gap-4 lg:ms-auto lg:me-auto">
              <div>
                <h2 id="demo-voice" className="site-h2 text-text">
                  {DEMO.voice.title}
                </h2>
                <p className="site-body mt-2 text-text-2">{DEMO.voice.text}</p>
              </div>
              <DemoScenarioList />
              <button
                type="button"
                onClick={pickRole}
                className="inline-flex min-h-12 items-center gap-2 self-start rounded-full px-1 text-body-strong text-text focus-ring"
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
            </div>
          </section>
        </>
      )}
    </SiteLayout>
  );
}
