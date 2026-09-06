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
import { Button } from "@/components/ui/button";
import { inScope, useApp } from "@/lib/app-context";
import { sites } from "@/mock/sites";
import { events } from "@/mock/events";
import { planFact, risks, tasks } from "@/mock/tasks";
import { requests } from "@/mock/supply";
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

function Dashboard() {
  const { siteId } = useApp();
  const scopedSites = siteId === "all" ? sites : sites.filter((s) => s.id === siteId);
  const scopedRisks = inScope(risks, siteId);
  const scopedTasks = inScope(tasks, siteId);
  const scopedEvents = inScope(events, siteId);
  const scopedRequests = inScope(requests, siteId);

  const pendingReview = scopedEvents.filter((e) => e.status === "review" || e.status === "extracted").length;
  const noReply = scopedRequests.filter((r) => r.repliesCount === 0 && r.status !== "draft").length;
  const overdue = scopedTasks.filter((t) => t.status === "overdue").length;
  const deviation = -14.2;

  return (
    <>
      <PageHeader
        title="Дашборд"
        description="Что горит прямо сейчас. Каждая цифра раскрывается до первоисточника: сообщения, файла, фото или страницы договора."
        actions={
          <Button size="sm" variant="secondary" asChild>
            <Link to="/verification">
              <CheckCircle2 className="size-4" /> Перейти к проверке
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <div className="xl:col-span-2"><MetricTile icon={Building2} label="Активных объектов" value={String(scopedSites.length)} delta="+1" deltaGood /></div>
        <MetricTile icon={Clock} label="Задач просрочено" value={String(overdue)} tone="danger" delta="+1" deltaGood={false} />
        <MetricTile icon={Inbox} label="Событий ждёт проверки" value={String(pendingReview)} tone="warn" delta="−3" deltaGood />
        <MetricTile icon={PackageSearch} label="Заявок без ответа" value={String(noReply)} tone="warn" delta="+2" deltaGood={false} />
        <MetricTile icon={AlertTriangle} label="Критичных рисков" value={String(scopedRisks.filter((r) => r.severity === "critical").length)} tone="danger" delta="0" deltaGood />
        <div className="md:col-span-2 xl:col-span-2"><MetricTile icon={TrendingDown} label="Отклонение план-факт" value={`${deviation}`} unit="%" tone="danger" delta="−3,1 п.п." deltaGood={false} /></div>
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
            <ul className="divide-y divide-border">
              {scopedRisks.map((r) => {
                const Icon = attentionIcons[r.kind];
                return (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5 transition-fast hover:bg-hover">
                    <Icon
                      className={cn("mt-0.5 size-4 shrink-0", r.severity === "critical" ? "text-danger" : "text-warn")}
                      strokeWidth={1.75}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium">{r.risk}</span>
                        <StatusBadge tone={r.severity === "critical" ? "danger" : r.severity === "high" ? "warn" : "neutral"}>
                          {r.severity === "critical" ? "критично" : r.severity === "high" ? "высокий" : "средний"}
                        </StatusBadge>
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">{r.cause}</p>
                      <p className="mt-1 text-caption text-text-muted">
                        {sites.find((s) => s.id === r.siteId)?.name} · срок {fmtDate(r.dueDate)} · источник: {r.sourceLabel}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" className="h-8 shrink-0" asChild>
                      <Link to="/risks">Открыть</Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
            {scopedSites.map((s) => (
              <article key={s.id} className="card-surface p-5 transition-fast hover:border-border-strong hover:shadow-[var(--shadow-sm)]">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-card-title">{s.name}</h3>
                  <StatusBadge tone={siteStatusMeta[s.status]!.tone}>{siteStatusMeta[s.status]!.label}</StatusBadge>
                </div>
                <p className="mt-1 text-caption text-text-muted">{s.address}</p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${s.progress}%` }} />
                  </div>
                  <span className="text-caption tnum text-text-secondary">{s.progress}%</span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-[11px] text-text-muted">Срок</dt>
                    <dd className="text-caption tnum">{fmtDate(s.deadline)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Объём</dt>
                    <dd className="text-caption tnum">
                      {fmtNum(s.areaFact)} / {fmtNum(s.areaPlan)} м²
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

          <Panel title="План-факт по объёмам, 30 дней" bodyClassName="p-4">
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
            {scopedEvents.slice(0, 8).map((e) => {
              const Icon = channelIcons[e.channel];
              return (
                <li key={e.id} className="px-5 py-3.5 transition-fast hover:bg-hover">
                  <div className="flex items-center gap-2 text-caption text-text-muted">
                    <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                    <span>{channelLabels[e.channel]}</span>
                    <span>·</span>
                    <span className="truncate">{e.authorName}</span>
                    <time className="ml-auto shrink-0">{fmtDateTime(e.at)}</time>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px]">{e.preview}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <StatusBadge tone={processingStatusMeta[e.status]!.tone}>{processingStatusMeta[e.status]!.label}</StatusBadge>
                    {e.confidence > 0 && <ConfidenceIndicator value={e.confidence} />}
                  </div>
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
