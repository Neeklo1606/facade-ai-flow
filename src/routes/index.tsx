import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
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
import {
  CountPill,
  HeroMetric,
  InsightBlock,
  MetricStrip,
  MetricStripSkeleton,
  PageHeader,
  PillTabs,
  SourceDrawer,
  WidgetCard,
  WidgetCardHeader,
} from "@/components/common";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageCaption } from "@/components/layout/PageActions";
import { AttentionList } from "@/components/dashboard/AttentionList";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { ProjectsMini } from "@/components/dashboard/ProjectsMini";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/api/dashboard";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import type { DashboardMetric, DashboardPeriod } from "@/api/types";
import { fmtDate, fmtNum, plural } from "@/lib/format";
import { useScreenState } from "@/lib/screen-state";

interface DashboardSearch {
  period?: DashboardPeriod | undefined;
}

const periods: DashboardPeriod[] = ["shift", "week", "month"];

/** Иконка метрики по ключу: набор задан дашбордом, а не данными */
const metricIcon: Record<string, typeof Building2> = {
  active: Building2,
  unverified: FileSearch,
  silent: Send,
  overdue: Clock,
  processing: ListChecks,
  volume: Banknote,
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    period: periods.includes(search["period"] as DashboardPeriod)
      ? (search["period"] as DashboardPeriod)
      : undefined,
  }),
  loader: async ({ context }) => {
    // Полоса метрик и главная метрика должны быть видны сразу: реестр и документы грузим заранее
    await Promise.all([
      prefetch(context.queryClient, queries.projects()),
      prefetch(context.queryClient, queries.documents()),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Дашборд — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Сводка по всем объектам: что требует решения, живой поток событий и незакрытый объём работ.",
      },
      { property: "og:title", content: "Дашборд — neeklo FieldOps" },
      {
        property: "og:description",
        content: "Что требует внимания сегодня по всем объектам.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const period = search.period ?? "week";
  const dash = useDashboard(period);
  const [source, setSource] = useState<string | null>(null);

  const unverified = dash.metrics.find((metric) => metric.key === "unverified");
  const screen = useScreenState({
    pending: dash.headPending,
    error: dash.headError,
    empty: !dash.headPending && dash.running === 0 && dash.progress.length === 0,
  });
  const blocked = screen === "loading" || screen === "error" || screen === "forbidden";

  return (
    <>
      <PageHeader
        title="Дашборд"
        actions={
          <Button variant="accent" asChild>
            <Link to="/projects" search={{ unverified: true }}>
              <ClipboardCheck className="size-4" /> Перейти к проверке
              <span className="tnum font-semibold">{unverifiedCount(unverified)}</span>
            </Link>
          </Button>
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
      <div className="mb-4 flex items-center justify-between gap-3 md:justify-end">
        <span className="text-[13px] text-text-3 md:hidden">Изменения</span>
        <PillTabs
          label="Период изменений"
          value={period}
          onChange={(next) =>
            navigate({
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

      {dash.headPending ? (
        <MetricStripSkeleton count={6} layout="six" />
      ) : (
        <MetricStrip
          layout="six"
          items={dash.metrics.map((metric) => ({
            icon: metricIcon[metric.key] ?? Building2,
            label: metric.label,
            value: metric.value,
            delta: metric.delta,
            to: metric.to,
            search: metric.search,
          }))}
        />
      )}

      <HeroMetric
        className="mt-4 shadow-[var(--lift-2)]"
        label="Незакрытый объём работ по договорам"
        value={dash.headPending ? "—" : heroValue(dash.volume.rub)}
        {...(dash.headPending ? {} : { unit: "млн ₽" })}
        {...(dash.headPending
          ? {}
          : { secondary: `${fmtNum(dash.volume.qty)} ${dash.volume.unit} осталось выполнить` })}
        note={heroNote(dash)}
      />

      <div data-main-zone className="mt-4">
        <ScreenGate
          state={screen}
          onRetry={dash.refetch}
          skeleton={<ScreenSkeleton kind="split" />}
          copy={{
            section: "Дашборд",
            roles: "руководителям проектов и генеральному директору",
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
          <div className="grid gap-4 lg:grid-cols-12">
            <WidgetCard className="min-w-0 lg:col-span-7">
              <WidgetCardHeader
                level={2}
                icon={AlertTriangle}
                title="Требует решения"
                hint="сначала просроченные ответы"
                aside={<CountPill>{fmtNum(dash.attention.length)}</CountPill>}
              />
              <AttentionList
                rows={dash.attention}
                pending={dash.listsPending}
                onSource={setSource}
              />
              <Link
                to="/projects"
                search={{ section: "timeline" }}
                className="focus-ring mt-4 inline-flex min-h-11 items-center text-[13px] font-medium text-text-2 transition-fast is-hover:text-text lg:min-h-0"
              >
                Все решения
              </Link>
            </WidgetCard>

            <div className="min-w-0 space-y-4 lg:col-span-5">
              <WidgetCard>
                <WidgetCardHeader
                  level={2}
                  icon={Radio}
                  title="Живой поток"
                  hint="почта, Telegram, загрузки"
                />
                <LiveFeed items={dash.feed} pending={dash.listsPending} onSource={setSource} />
              </WidgetCard>

              <WidgetCard>
                <WidgetCardHeader
                  level={2}
                  icon={Building2}
                  title="Объекты"
                  hint="готовность и отклонение"
                  aside={<CountPill>{fmtNum(dash.progress.length)}</CountPill>}
                />
                <ProjectsMini rows={dash.progress} pending={dash.headPending} />
              </WidgetCard>
            </div>
          </div>
        </ScreenGate>
      </div>

      {!blocked && dash.insight && (
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

      {!blocked && (
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
