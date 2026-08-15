import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ImageIcon, Inbox, Mic, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricTile } from "@/components/common/MetricTile";
import { Panel } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AgentSourceBadge } from "@/components/common/AgentSourceBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { ProjectCards } from "@/components/dashboard/ProjectCards";
import { PlanFactChart } from "@/components/dashboard/PlanFactChart";
import { Button } from "@/components/ui/button";
import { attentionItems, attentionMeta, dashboardMetrics } from "@/mock/dashboard";
import { reports } from "@/mock/reports";
import { projects } from "@/mock/projects";
import { ALL_PROJECTS, inScope, useApp } from "@/lib/app-context";
import { useAuth } from "@/lib/auth-context";
import { fmtAgo, fmtNum, fmtPct, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Дашборд — ФАСАД-РП" },
      {
        name: "description",
        content:
          "Что горит по фасадным объектам прямо сейчас: просрочки, поставки под угрозой, отчёты прорабов и план-факт.",
      },
      { property: "og:title", content: "Дашборд — ФАСАД-РП" },
      {
        property: "og:description",
        content: "Оперативная картина по всем фасадным объектам за 15 секунд.",
      },
    ],
  }),
  component: Dashboard,
});

const severityTone = { danger: "danger", warn: "warn", info: "info" } as const;

function PhotoThumb({ caption }: { caption?: string }) {
  return (
    <span className="relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-subtle">
      <ImageIcon className="size-4 text-text-muted" strokeWidth={1.5} />
      {caption && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-[color:var(--bg-surface)]/85 px-1 py-0.5 text-[11px] leading-[14px] text-text-secondary">
          {caption}
        </span>
      )}
    </span>
  );
}

function Dashboard() {
  const { projectId, scopedProjects } = useApp();
  const { account } = useAuth();
  const isForeman = account?.role === "foreman";

  const myProjects = isForeman
    ? projects.filter((p) => account!.user.projects.includes(p.id))
    : scopedProjects;
  const myProjectIds = myProjects.map((p) => p.id);

  const events = inScope(attentionItems, projectId).filter(
    (e) => !isForeman || myProjectIds.includes(e.projectId),
  );
  const feed = inScope(reports, projectId).filter(
    (r) => !isForeman || r.author === account!.user.name,
  );

  const scopeLabel =
    projectId === ALL_PROJECTS
      ? `${myProjects.length} активных объекта`
      : (projects.find((p) => p.id === projectId)?.name ?? "");

  return (
    <>
      <PageHeader
        title="Дашборд"
        description={`Утренняя сводка на 12 августа · ${scopeLabel}`}
        meta={
          <span className="text-caption text-text-muted">
            Демо-прототип. Данные синтетические
          </span>
        }
        actions={
          isForeman ? (
            <Button size="sm" className="gap-2">
              Отправить отчёт
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm">
                Экспорт сводки
              </Button>
              <Button size="sm" className="gap-2">
                Собрать отчёт за неделю
                <ArrowRight className="size-4" />
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          label={isForeman ? "Моих объектов" : "Активных объектов"}
          value={myProjects.length}
          delta={dashboardMetrics.activeProjects.delta}
        />
        <MetricTile
          label="Задач просрочено"
          value={dashboardMetrics.overdueTasks.value}
          delta={dashboardMetrics.overdueTasks.delta}
          invert
          tone="danger"
        />
        <MetricTile
          label="Отчётов не сдано вчера"
          value={dashboardMetrics.missingReports.value}
          delta={dashboardMetrics.missingReports.delta}
          invert
          tone="warn"
        />
        {!isForeman && (
          <>
            <MetricTile
              label="Заявок без ответа"
              value={dashboardMetrics.awaitingSuppliers.value}
              delta={dashboardMetrics.awaitingSuppliers.delta}
              invert
              tone="warn"
            />
            <MetricTile
              label="Отклонение план-факт"
              value={fmtPct(dashboardMetrics.planFactDeviation.value)}
              delta={dashboardMetrics.planFactDeviation.delta}
              invert
              tone="danger"
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel
            title="Требует внимания"
            bodyClassName="p-0"
            action={
              <span className="text-caption text-text-muted">
                {events.length} событий, по критичности
              </span>
            }
          >
            {events.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="Ничего не горит"
                description="По выбранному объекту нет просрочек, рисков поставки и пропущенных отчётов."
                actionLabel="Посмотреть график работ"
              />
            ) : (
              <ul>
                {events.map((e) => {
                  const meta = attentionMeta[e.kind];
                  const project = projects.find((p) => p.id === e.projectId);
                  return (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3 last:border-0 transition-fast hover:bg-subtle sm:flex-nowrap sm:px-5"
                    >
                      <meta.icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          e.severity === "danger"
                            ? "text-danger"
                            : e.severity === "warn"
                              ? "text-warn"
                              : "text-info",
                        )}
                        strokeWidth={1.75}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={severityTone[e.severity]}>{meta.label}</StatusBadge>
                          <span className="truncate text-caption text-text-muted">
                            {project?.shortName}
                          </span>
                          <span className="tnum text-caption text-text-muted">{fmtAgo(e.time)}</span>
                        </div>
                        <p className="mt-1 text-table text-text-primary">{e.text}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 shrink-0 text-table sm:min-h-9"
                      >
                        {e.actionLabel}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {!isForeman && (
            <div>
              <h2 className="mb-3 text-section-title">Объекты</h2>
              <ProjectCards items={scopedProjects} />
            </div>
          )}

          {!isForeman && (
            <Panel
              title="План-факт по объемам, 30 дней"
              action={
                <div className="flex items-center gap-4 text-caption text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-info" /> План
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-accent" /> Факт
                  </span>
                </div>
              }
            >
              <PlanFactChart />
            </Panel>
          )}
        </div>

        <Panel
          title={
            <div className="min-w-0">
              <h2 className="text-card-title">Последние отчёты</h2>
              <p className="text-caption text-text-muted">из Telegram</p>
            </div>
          }
          bodyClassName="p-0"
          footer={
            <Button variant="ghost" size="sm" className="min-h-11 w-full justify-center text-table">
              Все отчёты
            </Button>
          }
        >
          {feed.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Отчётов пока нет"
              description="Прорабы отправляют отчёты в Telegram-боте. Как только придет первый, он появится здесь."
              actionLabel="Напомнить прорабам"
            />
          ) : (
            <ul>
              {feed.map((r) => {
                const project = projects.find((p) => p.id === r.projectId);
                return (
                  <li
                    key={r.id}
                    className="border-b border-border px-4 py-3 last:border-0 transition-fast hover:bg-subtle sm:px-5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle text-caption font-medium">
                        {r.authorInitials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-table font-medium">{r.author}</div>
                        <div className="truncate text-caption text-text-muted">{project?.shortName}</div>
                      </div>
                      <span className="tnum shrink-0 text-caption text-text-muted">
                        {fmtTime(r.createdAt)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 text-table">
                      <span className="truncate text-text-secondary">{r.workType},</span>
                      <span className="tnum font-medium">
                        {fmtNum(r.volume)} {r.unit}
                      </span>
                      {r.source === "voice" && (
                        <>
                          <AgentSourceBadge
                            agent="Обработчик отчётов"
                            at={fmtTime(r.createdAt)}
                            source="голосовое сообщение в Telegram"
                          />
                          <ConfidenceIndicator
                            level={r.fields?.some((f) => f.confidence === "low") ? "low" : "medium"}
                          />
                        </>
                      )}
                    </div>
                    <div className="mt-1 truncate text-caption text-text-muted">
                      {r.zone} · {r.floors}
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      {Array.from({ length: Math.min(r.photos, 3) }).map((_, i) => (
                        <PhotoThumb key={i} caption={i === 0 ? r.workType : undefined} />
                      ))}
                      {r.photos > 3 && (
                        <span className="tnum text-caption text-text-muted">+{r.photos - 3}</span>
                      )}
                      {r.source === "voice" && (
                        <span className="ml-auto inline-flex items-center gap-1 text-caption text-accent">
                          <Mic className="size-3.5" />
                          {r.voiceDurationSec}с
                        </span>
                      )}
                    </div>

                    {r.issues.length > 0 && (
                      <div className="mt-2 rounded-md bg-warn-bg px-2 py-1.5 text-caption text-text-primary">
                        {r.issues[0]}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
