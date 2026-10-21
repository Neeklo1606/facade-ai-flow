import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Building2,
  ClipboardCheck,
  Clock,
  FileSearch,
  ListChecks,
  Radio,
  Send,
  Sparkles,
} from "lucide-react";
import { InsightBlock, PageHeader, SourceDrawer, WidgetCardHeader } from "@/components/common";
import { DeltaPill, type Delta } from "@/components/common/MetricStrip";
import { EventCard, SectionTitle, SegTabs, TipContent, ToneDot } from "@/components/v3";
import { stretchedLink, tipCapsule, type V3Tone } from "@/components/v3/classes";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageCaption } from "@/components/layout/PageActions";
import { AttentionList } from "@/components/dashboard/AttentionList";
import { isLegacyPath, legacyModulesEnabled } from "@/lib/legacy-modules";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { ProjectsMini } from "@/components/dashboard/ProjectsMini";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/api/dashboard";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import type { DashboardMetric, DashboardPeriod } from "@/api/types";
import { fmtDate, fmtNum, fmtTime, plural } from "@/lib/format";
import { useScreenState } from "@/lib/screen-state";
import { useAccess } from "@/api/access";
import { useCheckQueue } from "@/api/check";
import { useQuery } from "@tanstack/react-query";

interface DashboardSearch {
  period?: DashboardPeriod | undefined;
}

const periods: DashboardPeriod[] = ["shift", "week", "month"];

/**
 * Короткие подписи трёх чисел. В ячейке шириной 114 px на 375 px «Просроченных ответов»
 * не помещается и ломается посреди слова; полное название остаётся в подсказке.
 */
const SHORT_LABEL: Record<string, string> = {
  volume: "Незакрыто, млн ₽",
  unverified: "На проверке",
  overdue: "Просрочено",
};

/** Иконка метрики по ключу: набор задан дашбордом, а не данными */
const metricIcon: Record<string, typeof Building2> = {
  active: Building2,
  unverified: FileSearch,
  silent: Send,
  overdue: Clock,
  processing: ListChecks,
  volume: Banknote,
};

export const Route = createFileRoute("/attention")({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    period: periods.includes(search["period"] as DashboardPeriod)
      ? (search["period"] as DashboardPeriod)
      : undefined,
  }),
  loader: async ({ context }) => {
    // Три числа и главная метрика должны быть видны сразу: реестр и документы грузим заранее
    await Promise.all([
      prefetch(context.queryClient, queries.projects()),
      prefetch(context.queryClient, queries.documents()),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Обзор объектов — гайка" },
      {
        name: "description",
        content:
          "Что требует решения по всем объектам: незакрытый объём, очередь проверки и просроченные ответы.",
      },
      { property: "og:title", content: "Обзор объектов — гайка" },
      {
        property: "og:description",
        content: "Что требует решения сегодня по всем объектам.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AttentionPage,
});

function AttentionPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const period = search.period ?? "week";
  const dash = useDashboard(period);
  const registryRows = useQuery(queries.projects());
  const [source, setSource] = useState<string | null>(null);
  const { can } = useAccess();

  const unverified = dash.metrics.find((metric) => metric.key === "unverified");
  /*
   * Строки и ссылки, которые ведут в модули за флагом `legacy_modules`, из «Обзора» уходят
   * вместе с модулями (ADR-034, п. 4): ссылка, которая перенаправляет на рабочий экран,
   * человеку не помогает. Число остаётся, дверь исчезает.
   */
  const legacy = legacyModulesEnabled();
  const attentionRows = legacy
    ? dash.attention
    : dash.attention.filter((row) => !isLegacyPath(row.to));
  /*
   * Три числа вместо шести (ADR-028, п. 4): незакрытый объём, очередь проверки, просрочено.
   * Каждое показывается, только если роли открыт его источник — «Обзор» не раздел прав,
   * а сборка. Остальные три метрики доступны в своих разделах и в полосе не нужны: две из них
   * в демонстрации говорят «без прироста», то есть занимают место, ничего не сообщая.
   */
  const headline = (["volume", "unverified", "overdue"] as const)
    // Без флага строки спецификации и ответы поставщиков не считаются (ADR-041)
    .filter((key) => legacy || key === "volume")
    .map((key) => dash.metrics.find((metric) => metric.key === key))
    .filter((metric): metric is DashboardMetric => !!metric)
    .map((metric) => ({
      ...metric,
      label: SHORT_LABEL[metric.key] ?? metric.label,
      // Единица уходит в подпись: «97 млн ₽» в ячейку 95 px не помещается, «97,2» помещается
      value: metric.key === "volume" ? heroValue(dash.volume.rub) : metric.value,
    }));
  /*
   * Очередь ГАЙКИ — отчёты с площадки на проверке, а не строки спецификации (ADR-041).
   * Запрос идёт, только если роль решает по отчётам: остальным он вернул бы отказ.
   */
  const decidesReports = can("field-reports", "write");
  const check = useCheckQueue(null, !legacy && decidesReports);
  const reviewCount = check.queue.length;
  const missing = dash.progress.length
    ? (registryRows.data ?? []).reduce((sum, row) => sum + row.overview.missingReports, 0)
    : 0;
  /*
   * Очередь ГАЙКИ в ленте решений: отчёты на проверке карточками событий. Без флага строки
   * прежнего контура уходят, и лента руководителя оставалась пустой при двух отчётах в очереди.
   */
  const queueRows = !legacy && decidesReports ? check.queue.slice(0, 5) : [];
  const volumeMetric = headline.find((metric) => metric.key === "volume");
  const volumeDelta =
    volumeMetric?.delta && volumeMetric.delta.direction !== "flat" ? volumeMetric.delta : undefined;
  const tiles: NumberTileProps[] = [
    ...headline
      .filter((metric) => metric.key !== "volume")
      .map((metric) => ({
        icon: metricIcon[metric.key] ?? Building2,
        label: metric.label,
        value: metric.value,
        ...(metric.delta ? { delta: metric.delta } : {}),
        ...(legacy || !isLegacyPath(String(metric.to ?? ""))
          ? { to: metric.to, search: metric.search }
          : {}),
      })),
    ...(!legacy && decidesReports
      ? [{ icon: ClipboardCheck, label: "На проверке", value: fmtNum(reviewCount), to: "/check" }]
      : []),
    ...(!legacy ? [{ icon: AlertTriangle, label: "Нет отчёта", value: fmtNum(missing) }] : []),
  ];
  const brief: { label: string; value: number; tone: V3Tone; to: string }[] = [
    { label: "Объектов под риском", value: dash.atRisk, tone: "danger", to: "/projects" },
    { label: "Отчётов не пришло", value: missing, tone: "warn", to: "/projects" },
    {
      label: "Ждут решения",
      value: attentionRows.length + queueRows.length,
      tone: "warn",
      to: !legacy && decidesReports ? "/check" : "/attention",
    },
  ];
  const tip =
    !legacy && decidesReports && reviewCount > 0
      ? {
          to: "/check",
          search: {},
          text: `${fmtNum(reviewCount)} ${plural(reviewCount, "отчёт ждёт", "отчёта ждут", "отчётов ждут")} проверки${missing > 0 ? `, ${fmtNum(missing)} ${plural(missing, "отчёт не пришёл", "отчёта не пришли", "отчётов не пришли")}` : ""}. Начните с очереди`,
        }
      : null;
  const screen = useScreenState({
    pending: dash.headPending,
    error: dash.headError,
    empty: !dash.headPending && dash.running === 0 && dash.progress.length === 0,
  });
  const blocked = screen === "loading" || screen === "error" || screen === "forbidden";

  return (
    <>
      <PageHeader
        title="Обзор"
        actions={
          !legacy ? (
            decidesReports ? (
              <Button variant="accent" asChild>
                <Link to="/check">
                  <ClipboardCheck className="size-4" /> К проверке
                  <span className="tnum font-semibold">{fmtNum(reviewCount)}</span>
                </Link>
              </Button>
            ) : null
          ) : // Главное действие ведёт в проверку позиций: без права на документы его нет
          can("documents") ? (
            <Button variant="accent" asChild>
              <Link to="/projects" search={{ unverified: true }}>
                <ClipboardCheck className="size-4" /> Перейти к проверке
                <span className="tnum font-semibold">{unverifiedCount(unverified)}</span>
              </Link>
            </Button>
          ) : null
        }
      />
      <PageCaption>
        <span className="truncate">
          {fmtDate(dash.now)} · {fmtNum(dash.active)}{" "}
          {plural(dash.active, "объект", "объекта", "объектов")} в работе
          {dash.atRisk > 0 && `, ${fmtNum(dash.atRisk)} под риском`}
        </span>
      </PageCaption>

      {/* Период меняет только дельты и ленту: значения метрик — состояние на сейчас */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-meta hidden text-text-3 sm:inline">Изменения за период</span>
        <SegTabs
          stretch
          className="w-full sm:w-auto"
          label="Период изменений"
          value={period}
          onChange={(next) =>
            void navigate({
              search: () => ({ period: next === "week" ? undefined : next }),
              replace: true,
              resetScroll: false,
            })
          }
          tabs={[
            { value: "shift", label: "Смена" },
            { value: "week", label: "7 дней" },
            { value: "month", label: "30 дней" },
          ]}
        />
      </div>

      {/* Три числа (ADR-028): главное — незакрытый объём на тёплом поле, два других рядом */}
      <section aria-label="Что требует решения в числах" className="grid gap-3 lg:grid-cols-12">
        <div className="hero-field flex min-h-[208px] flex-col justify-between px-5 pt-5 pb-5 sm:px-7 sm:pt-6 lg:col-span-7 lg:min-h-[248px]">
          <span
            aria-hidden
            className="orb -top-16 -right-12 size-[220px] sm:-top-20 sm:right-4 sm:size-[300px]"
          />
          <p className="text-body-strong font-medium text-text-2">
            Незакрытый объём работ по договорам
          </p>
          <div className="mt-6">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-hero-num text-text">
                {dash.headPending ? "—" : heroValue(dash.volume.rub)}
              </span>
              <span className="text-heading text-text-2">млн ₽</span>
              {volumeDelta ? <DeltaPill delta={volumeDelta} className="self-center" /> : null}
            </p>
            <p className="text-body tnum mt-2 text-text-2">
              {dash.headPending
                ? "Считаем по договорам и захваткам…"
                : `${fmtNum(dash.volume.qty)} ${dash.volume.unit} осталось выполнить`}
            </p>
            <p className="text-meta mt-3 line-clamp-3 max-w-[560px] text-text-3">
              {heroNote(dash)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:col-span-5">
          {dash.headPending
            ? Array.from({ length: 2 }).map((_, index) => (
                <div key={index} aria-hidden className="card-v3 min-h-[148px] p-5">
                  <span className="skeleton block size-9 rounded-full" />
                  <span className="skeleton mt-6 block h-3 w-20" />
                  <span className="skeleton mt-2 block h-8 w-12" />
                </div>
              ))
            : tiles.map((tile) => <NumberTile key={tile.label} {...tile} />)}
        </div>
      </section>

      {tip ? (
        <Link to={tip.to} search={tip.search as never} className={`${tipCapsule} mt-4`}>
          <TipContent>{tip.text}</TipContent>
        </Link>
      ) : null}

      <div data-main-zone className="mt-8">
        <ScreenGate
          state={screen}
          onRetry={dash.refetch}
          skeleton={<ScreenSkeleton kind="split" />}
          copy={{
            section: "Обзор",
            roles: "тем, кому открыты закупки или документация",
            errorTitle: "Не удалось загрузить сводку",
            empty: {
              icon: Building2,
              title: "Объектов в работе нет",
              description:
                "Добавьте объект и загрузите договор с проектной документацией — сводка появится сразу после этого.",
              actionLabel: "Открыть реестр объектов",
              onAction: () => void navigate({ to: "/projects", search: {} }),
            },
          }}
        >
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-6">
            <section className="min-w-0 lg:col-span-7 xl:col-span-8">
              <SectionTitle
                count={attentionRows.length + queueRows.length}
                hint={legacy ? "сначала просроченные ответы" : "что ждёт вашего ответа"}
                aside={
                  legacy && dash.sources.history ? (
                    <Link
                      to="/projects"
                      search={{ section: "timeline" }}
                      className="text-meta-strong focus-ring inline-flex min-h-12 items-center rounded-full px-3 font-medium text-text-2 transition-fast is-hover:bg-surface-2 is-hover:text-text lg:min-h-10"
                    >
                      Все решения
                    </Link>
                  ) : undefined
                }
              >
                Требует решения
              </SectionTitle>
              <AttentionList
                rows={attentionRows}
                pending={dash.listsPending}
                onSource={setSource}
                extraCount={queueRows.length}
                extra={queueRows.map(({ card, projectName, zoneName }) => (
                  <li key={card.report.id}>
                    <EventCard
                      tone="warn"
                      title={`Отчёт на проверке: ${card.report.workType.toLowerCase()}`}
                      meta={[projectName, zoneName].filter(Boolean).join(" · ")}
                      aside={
                        <>
                          <span className="block font-medium text-text">
                            {fmtTime(card.report.sentAt)}
                          </span>
                          <span className="text-meta block text-text-3">
                            {fmtNum(card.report.declaredQty)} {card.report.unit}
                          </span>
                        </>
                      }
                      footer={
                        <span className="text-meta inline-flex items-center gap-2 text-text-2">
                          <ToneDot tone="warn" />
                          Ожидает проверки
                        </span>
                      }
                      action={
                        <Link
                          to="/check"
                          aria-label={`Проверить отчёт: ${card.report.workType}`}
                          className={stretchedLink}
                        />
                      }
                    />
                  </li>
                ))}
              />
            </section>

            <aside className="min-w-0 space-y-6 lg:col-span-5 xl:col-span-4">
              <section className="card-v3 p-5">
                <h2 className="text-body-strong font-semibold text-text">Кратко</h2>
                <ul className="mt-3 space-y-1">
                  {brief.map((item) => (
                    <li key={item.label}>
                      <Link
                        to={item.to}
                        className="focus-ring flex min-h-12 items-center gap-3 rounded-[var(--r-md)] px-2 -mx-2 transition-fast is-hover:bg-surface-2"
                      >
                        <ToneDot tone={item.value > 0 ? item.tone : "neutral"} />
                        <span className="text-body min-w-0 flex-1 truncate text-text-2">
                          {item.label}
                        </span>
                        <span className="text-heading tnum text-text">{fmtNum(item.value)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Лента событий живёт в «Истории»: роли без права на неё блок не показываем,
                  пустая карточка «почта, Telegram, загрузки» обещала бы несуществующее */}
              {legacy && dash.sources.history && (
                <section className="card-v3 p-6">
                  <WidgetCardHeader
                    level={2}
                    icon={Radio}
                    title="Последние события"
                    hint="письма, отчёты, документация"
                  />
                  <LiveFeed items={dash.feed} pending={dash.listsPending} onSource={setSource} />
                </section>
              )}

              <section className="card-v3 p-5">
                <SectionTitle
                  className="mb-4"
                  count={dash.progress.length}
                  hint="готовность и отклонение"
                >
                  <span className="text-body">Объекты</span>
                </SectionTitle>
                <ProjectsMini rows={dash.progress} pending={dash.headPending} />
              </section>
            </aside>
          </div>
        </ScreenGate>
      </div>

      {legacy && !blocked && dash.insight && (
        <InsightBlock
          tone="sand"
          icon={Sparkles}
          className="mt-4"
          title={dash.insight.title}
          text={dash.insight.text}
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link to="/projects/$id" params={{ id: dash.insight.projectId }}>
                Открыть объект
              </Link>
            </Button>
          }
        />
      )}

      {legacy && !blocked && can("documents") && (
        <MobileActionBar>
          <Button variant="accent" asChild>
            <Link to="/projects" search={{ unverified: true }}>
              <ClipboardCheck className="size-4" /> К проверке
              <span className="tnum font-semibold">{unverifiedCount(unverified)}</span>
            </Link>
          </Button>
        </MobileActionBar>
      )}

      {source && <SourceDrawer sourceId={source} onOpenChange={() => setSource(null)} />}
    </>
  );
}

/** Число ожидающих проверки позиций для главного действия; пока метрик нет — прочерк */
function unverifiedCount(metric: DashboardMetric | undefined) {
  return metric?.value ?? "—";
}

/** Рубли главной метрики: «167,4 млн» — единица уходит в приписку */
function heroValue(rub: number) {
  return (rub / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

/** Пояснение к главной метрике: по каким работам, по каким объектам и как считаны рубли */
function heroNote(dash: ReturnType<typeof useDashboard>) {
  if (dash.headPending) return "Считаем по договорам и захваткам…";
  const { volume } = dash;
  // Стадии работ перечисляем не все: две первые и счёт остальных, иначе строка уходит в абзац
  const head = volume.stages.slice(0, 2).join(", ").toLowerCase();
  const rest = volume.stages.length - 2;
  const stages = volume.stages.length
    ? rest > 0
      ? `${head} и ещё ${fmtNum(rest)} ${plural(rest, "стадия", "стадии", "стадий")}`
      : head
    : "работы по договорам";
  const top = volume.top ? ` Больше всего осталось на «${volume.top.name}».` : "";
  return `${stages} · ${fmtNum(volume.projects)} ${plural(volume.projects, "объект", "объекта", "объектов")}. Рубли — оценка по договорной цене единицы объёма.${top}`;
}

interface NumberTileProps {
  icon: typeof Building2;
  label: string;
  value: string;
  delta?: Delta | undefined;
  to?: string | undefined;
  search?: Record<string, unknown> | undefined;
}

/**
 * Число «Обзора» плиткой v3: подпись, затем значение крупно (по этому порядку сверяются
 * цифры между экранами). Плитка со ссылкой открывает источник числа целиком.
 */
function NumberTile({ icon: Icon, label, value, delta, to, search }: NumberTileProps) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-full bg-surface-2">
          <Icon className="size-4 text-text-2" strokeWidth={1.75} aria-hidden />
        </span>
        {to ? <ArrowUpRight className="size-4 text-text-3" aria-hidden /> : null}
      </span>
      <span className="mt-auto block pt-6">
        <span className="text-meta block text-text-3">{label}</span>
        <span className="text-hero tnum mt-1 block text-text">{value}</span>
      </span>
      {delta && delta.direction !== "flat" ? (
        <span className="mt-2 block">
          <DeltaPill delta={delta} short />
        </span>
      ) : null}
    </>
  );
  const box = "card-v3 flex min-h-[148px] min-w-0 flex-col p-4 sm:p-5 lg:min-h-full";
  return to ? (
    <Link
      to={to}
      search={(search ?? {}) as never}
      title={`Открыть: ${label.toLowerCase()}`}
      className={`${box} focus-ring press transition-fast is-hover:shadow-[var(--lift-2)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
