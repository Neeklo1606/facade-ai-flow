import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSignature,
  HardHat,
  Inbox,
  Mail,
  MapPin,
  MessageSquare,
  PackageSearch,
  TrendingDown,
  Upload,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricTile } from "@/components/common/MetricTile";
import { Panel } from "@/components/common/Panel";
import { StatusBadge, siteStatusMeta, processingStatusMeta, channelLabels } from "@/components/common/StatusBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { ExplainPopover } from "@/components/common/ExplainPopover";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inScope, useApp } from "@/lib/app-context";
import { sites } from "@/mock/sites";
import { events } from "@/mock/events";
import { planFact, risks, tasks } from "@/mock/tasks";
import { requests } from "@/mock/supply";
import { toastUndo } from "@/lib/toast";
import { fmtDate, fmtDateTime, fmtMln, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Дашборд — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Операционная сводка подрядчика: риски, объёмы, события с площадки и снабжение с проверяемыми источниками.",
      },
      { property: "og:title", content: "Дашборд — neeklo FieldOps" },
      { property: "og:description", content: "Что горит прямо сейчас: риски, план-факт, поток данных с площадки." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const attentionIcons = {
  deadline: CalendarClock,
  material: PackageSearch,
  overspend: TrendingDown,
  unclosed_volume: HardHat,
  open_issue: AlertTriangle,
  document: FileSignature,
  reporting: MessageSquare,
} as const;

const channelIcons = {
  telegram: MessageSquare,
  email: Mail,
  upload: Upload,
  web: Building2,
  telephony: Clock,
} as const;

type Period = "7" | "30" | "q";
const periods: { id: Period; label: string }[] = [
  { id: "7", label: "7 дней" },
  { id: "30", label: "30 дней" },
  { id: "q", label: "Квартал" },
];

/** Детерминированный ряд для спарклайна — прототип без внешних данных. */
function trendSeries(seed: number, period: Period) {
  const len = period === "7" ? 7 : period === "30" ? 12 : 16;
  const out: number[] = [];
  let v = 40 + (seed % 25);
  for (let i = 0; i < len; i++) {
    v += Math.sin((i + seed) * 1.7) * 6 + ((seed * (i + 3)) % 7) - 3;
    out.push(Math.max(4, v));
  }
  return out;
}

type MetricKey = "sites" | "overdue" | "review" | "requests" | "risks" | "deviation";

function Chip({ icon: Icon, children }: { icon?: typeof MapPin; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] max-w-full items-center gap-1 rounded-[var(--r-xs)] bg-subtle px-2 text-[11px] text-text-secondary">
      {Icon && <Icon className="size-3 shrink-0" strokeWidth={1.5} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function Dashboard() {
  const { siteId } = useApp();
  const [period, setPeriod] = useState<Period>("30");
  const [focus, setFocus] = useState<MetricKey | null>(null);

  const scopedSites = siteId === "all" ? sites : sites.filter((s) => s.id === siteId);
  const scopedRisks = inScope(risks, siteId);
  const scopedTasks = inScope(tasks, siteId);
  const scopedEvents = inScope(events, siteId);
  const scopedRequests = inScope(requests, siteId);

  const pendingReview = scopedEvents.filter((e) => e.status === "review" || e.status === "extracted").length;
  const noReply = scopedRequests.filter((r) => r.repliesCount === 0 && r.status !== "draft").length;
  const overdue = scopedTasks.filter((t) => t.status === "overdue").length;
  const criticalCount = scopedRisks.filter((r) => r.severity === "critical").length;
  const deviation = -14.2;

  const trends = useMemo(
    () => ({
      sites: trendSeries(3, period),
      overdue: trendSeries(11, period),
      review: trendSeries(5, period),
      requests: trendSeries(8, period),
      risks: trendSeries(2, period),
      deviation: trendSeries(14, period),
    }),
    [period],
  );

  const toggle = (key: MetricKey) => setFocus((prev) => (prev === key ? null : key));

  const visibleRisks =
    focus === "risks" ? scopedRisks.filter((r) => r.severity === "critical") : scopedRisks;
  const visibleEvents =
    focus === "review"
      ? scopedEvents.filter((e) => e.status === "review" || e.status === "extracted")
      : scopedEvents;

  const grouped = [
    { key: "critical", label: "Критично", items: visibleRisks.filter((r) => r.severity === "critical") },
    { key: "rest", label: "Прочее", items: visibleRisks.filter((r) => r.severity !== "critical") },
  ].filter((g) => g.items.length > 0);
  const useGroups = visibleRisks.length > 8;

  return (
    <>
      <PageHeader
        title="Дашборд"
        description="Что горит прямо сейчас. Каждая цифра раскрывается до первоисточника: сообщения, файла, фото или страницы договора."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-[var(--r-pill)] bg-subtle p-1">
              {periods.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    "focus-ring h-[30px] rounded-[var(--r-pill)] px-3 text-[13px] transition-fast",
                    period === p.id
                      ? "bg-surface font-medium text-text-primary shadow-[var(--shadow-xs)]"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/verification">
                <CheckCircle2 className="size-4" /> Перейти к проверке
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          icon={Building2}
          label="Активных объектов"
          value={String(scopedSites.length)}
          delta={1}
          polarity="higher-better"
          trend={trends.sites}
          active={focus === "sites"}
          onClick={() => toggle("sites")}
        />
        <MetricTile
          icon={Clock}
          label="Задач просрочено"
          value={String(overdue)}
          tone="danger"
          variant="accent"
          delta={1}
          polarity="lower-better"
          trend={trends.overdue}
          active={focus === "overdue"}
          onClick={() => toggle("overdue")}
        />
        <MetricTile
          icon={Inbox}
          label="Событий ждёт проверки"
          value={String(pendingReview)}
          tone="warn"
          delta={-3}
          polarity="lower-better"
          trend={trends.review}
          active={focus === "review"}
          onClick={() => toggle("review")}
        />
        <MetricTile
          icon={PackageSearch}
          label="Заявок без ответа"
          value={String(noReply)}
          tone="warn"
          delta={2}
          polarity="lower-better"
          trend={trends.requests}
          active={focus === "requests"}
          onClick={() => toggle("requests")}
        />
        <MetricTile
          icon={AlertTriangle}
          label="Критичных рисков"
          value={String(criticalCount)}
          tone="danger"
          variant="accent"
          delta={0}
          polarity="lower-better"
          trend={trends.risks}
          active={focus === "risks"}
          onClick={() => toggle("risks")}
        />
        <MetricTile
          icon={TrendingDown}
          label="Отклонение план-факт"
          value={`${deviation}`}
          unit="%"
          tone="danger"
          delta={-3.1}
          deltaText="−3,1 п.п."
          polarity="higher-better"
          trend={trends.deviation}
          active={focus === "deviation"}
          onClick={() => toggle("deviation")}
        />
      </div>

      <div className="mt-3.5 grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-3.5">
          <Panel
            title="Требует внимания"
            bodyClassName="p-0"
            action={
              <Link to="/risks" className="text-caption text-info transition-fast hover:underline">
                Все риски
              </Link>
            }
          >
            {(useGroups ? grouped : [{ key: "all", label: "", items: visibleRisks }]).map((group) => (
              <div key={group.key}>
                {useGroups && group.label && (
                  <div className="flex items-center gap-2 border-b border-border bg-raised px-5 py-1.5 text-overline text-text-muted">
                    {group.label}
                    <span className="tnum">{group.items.length}</span>
                  </div>
                )}
                <ul>
                  {group.items.map((r) => {
                    const Icon = attentionIcons[r.kind];
                    return (
                      <li
                        key={r.id}
                        className="group relative cursor-pointer px-5 py-3 transition-fast hover:bg-hover after:absolute after:inset-x-0 after:bottom-0 after:ml-[28px] after:h-px after:bg-border last:after:hidden"
                      >
                        <div className="flex items-start gap-3">
                          <span className="grid size-7 shrink-0 place-items-center rounded-[var(--r-xs)] bg-subtle">
                            <Icon
                              className={cn("size-[18px]", r.severity === "critical" ? "text-danger" : "text-warn")}
                              strokeWidth={1.5}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="min-w-0 truncate text-[15px] font-medium">{r.risk}</span>
                                </TooltipTrigger>
                                <TooltipContent>{r.risk}</TooltipContent>
                              </Tooltip>
                              <StatusBadge
                                tone={r.severity === "critical" ? "danger" : r.severity === "high" ? "warn" : "neutral"}
                              >
                                {r.severity === "critical" ? "критично" : r.severity === "high" ? "высокий" : "средний"}
                              </StatusBadge>
                            </div>
                            <p className="mt-0.5 truncate text-[13px] text-text-secondary">{r.cause}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Chip icon={MapPin}>{sites.find((s) => s.id === r.siteId)?.name}</Chip>
                              <Chip icon={CalendarClock}>срок {fmtDate(r.dueDate)}</Chip>
                              <Chip icon={FileSignature}>{r.sourceLabel}</Chip>
                            </div>
                          </div>
                          <div className="shrink-0 opacity-0 transition-fast group-hover:opacity-100 focus-within:opacity-100">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8"
                              onClick={() => toastUndo("Риск взят в работу", () => {}, r.risk)}
                            >
                              В работу
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </Panel>

          <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
            {scopedSites.map((s) => (
              <article key={s.id} className="card-surface p-5 transition-fast hover:border-border-strong hover:shadow-[var(--shadow-sm)]">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-card-title">{s.name}</h3>
                  <StatusBadge tone={siteStatusMeta[s.status]!.tone}>{siteStatusMeta[s.status]!.label}</StatusBadge>
                </div>
                <p className="mt-1 truncate text-caption text-text-muted" title={s.address}>
                  {s.address}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-subtle">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${s.progress}%` }} />
                  </div>
                  <span className="text-caption tnum text-text-secondary">{s.progress}%</span>
                  <ExplainPopover
                    title="Как считается готовность"
                    formula="готовность = закрытый объём / плановый объём × 100"
                    sources={[
                      { label: "Отчёты с площадки за неделю", hint: "подтверждено прорабом" },
                      { label: "Акты КС-2 по объекту", hint: "ПТО, 3 документа" },
                      { label: "Ведомость объёмов из договора", hint: "стр. 4" },
                    ]}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-[11px] text-text-muted">Срок</dt>
                    <dd className="text-caption tnum">{fmtDate(s.deadline)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Объём</dt>
                    <dd className="text-caption tnum">
                      {fmtNum(s.areaFact)} / {fmtNum(s.areaPlan)} <span className="text-[11px] text-text-secondary">м²</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Сумма</dt>
                    <dd className="text-caption tnum">{fmtMln(s.contractSum)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <Panel
            title="План-факт по объёмам, 30 дней"
            bodyClassName="p-4"
            action={
              <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                отклонение <span className="tnum font-medium text-danger">{deviation}%</span>
                <ExplainPopover
                  title="Как получено отклонение план-факт"
                  formula="(факт − план) / план × 100 за выбранный период"
                  sources={[
                    { label: "График работ, базовая версия", hint: "утверждён 12.03" },
                    { label: "Отчёты с площадки, 30 дней", hint: "48 подтверждённых записей" },
                    { label: "Замечания заказчика", hint: "приостановка 3 дня" },
                  ]}
                />
              </span>
            }
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={planFact} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <RTooltip
                    contentStyle={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="plan" name="План, м²" stroke="var(--text-muted)" fill="var(--bg-subtle)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="fact" name="Факт, м²" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <Panel
          title="Последние события"
          bodyClassName="p-0"
          className="min-w-0"
          action={
            <Link to="/inbox" className="text-caption text-info transition-fast hover:underline">
              Входящие
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {visibleEvents.slice(0, 8).map((e) => {
              const Icon = channelIcons[e.channel];
              const processing = e.status === "received" || e.status === "recognizing";
              return (
                <li key={e.id} className="relative px-5 py-3.5 transition-fast hover:bg-hover">
                  <div className="flex items-center gap-2 text-caption text-text-muted">
                    <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
                    <span>{channelLabels[e.channel]}</span>
                    <span>·</span>
                    <span className="truncate">{e.authorName}</span>
                    <time className="ml-auto shrink-0" title={fmtDateTime(e.at)}>
                      {fmtDateTime(e.at)}
                    </time>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px]">{e.preview}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <StatusBadge tone={processingStatusMeta[e.status]!.tone}>{processingStatusMeta[e.status]!.label}</StatusBadge>
                    {e.confidence > 0 && <ConfidenceIndicator value={e.confidence} />}
                  </div>
                  {processing && (
                    <span className="live-bar" aria-hidden>
                      <span className="live-bar-fill" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <p className="mt-4 text-caption text-text-muted">Данные синтетические, прототип интерфейса.</p>
    </>
  );
}
