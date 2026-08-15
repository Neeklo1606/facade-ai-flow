import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileSignature,
  Mail,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { Panel } from "@/components/common/Panel";
import { ProgressBar } from "@/components/common/ProgressBar";
import {
  StatusBadge,
  projectStatusLabel,
  projectStatusTone,
  type StatusTone,
} from "@/components/common/StatusBadge";
import { AgentSourceBadge } from "@/components/common/AgentSourceBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/lib/data-context";
import { getProject } from "@/mock/projects";
import { getObjectDetail, type MilestoneStatus } from "@/mock/objectDetail";
import { getSchedule } from "@/mock/schedule";
import { documents } from "@/mock/documents";
import { purchaseRequests, purchaseStatusLabels } from "@/mock/purchases";
import { reportStatusLabels } from "@/mock/reports";
import { taskStatusLabels } from "@/mock/tasks";
import { fmtDate, fmtDateTime, fmtMln, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/objects/$id")({
  head: () => ({
    meta: [
      { title: "Карточка объекта — ФАСАД-РП" },
      { name: "description", content: "Сроки, готовность, риски, финансы и захватки фасадного объекта." },
      { property: "og:title", content: "Карточка объекта — ФАСАД-РП" },
      { property: "og:description", content: "Сроки, готовность, риски, финансы и захватки фасадного объекта." },
    ],
  }),
  component: ObjectPage,
});

const milestoneMeta: Record<MilestoneStatus, { tone: StatusTone; label: string }> = {
  done: { tone: "ok", label: "Выполнено" },
  on_track: { tone: "info", label: "В срок" },
  at_risk: { tone: "warn", label: "Под угрозой" },
  overdue: { tone: "danger", label: "Просрочено" },
};

const tabs = [
  ["overview", "Обзор"],
  ["schedule", "График"],
  ["tasks", "Задачи"],
  ["reports", "Отчёты"],
  ["docs", "Документы"],
  ["supply", "Снабжение"],
  ["zones", "Захватки"],
  ["finance", "Финансы"],
  ["journal", "Журнал"],
] as const;

function ObjectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { tasks, reports, projectView } = useData();
  const base = getProject(id);

  if (!base) {
    return (
      <Panel bodyClassName="p-0">
        <EmptyState
          icon={TriangleAlert}
          title="Объект не найден"
          description="Проверьте ссылку — такого объекта нет в демо-данных."
          actionLabel="К списку объектов"
          onAction={() => navigate({ to: "/objects" })}
        />
      </Panel>
    );
  }

  const p = projectView(base);
  const detail = getObjectDetail(p.id, p.contractSum, p.budgetFact);
  const schedule = getSchedule(p.id);
  const projectTasks = tasks.filter((t) => t.projectId === p.id);
  const projectReports = reports.filter((r) => r.projectId === p.id);
  const projectDocs = documents.filter((d) => d.projectId === p.id);
  const projectPurchases = purchaseRequests.filter((r) => r.projectId === p.id);

  return (
    <>
      <Link
        to="/objects"
        className="mb-3 inline-flex items-center gap-1.5 text-caption text-text-muted transition-fast hover:text-text-primary"
      >
        <ArrowLeft className="size-4" /> Все объекты
      </Link>

      <header className="card-surface mb-4 p-4 lg:p-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-page-title">{p.name}</h1>
              <StatusBadge tone={projectStatusTone[p.status]} dot>
                {projectStatusLabel[p.status]}
              </StatusBadge>
            </div>
            <p className="mt-1 text-base text-text-secondary">{p.address}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-caption lg:grid-cols-4">
              <Field label="Заказчик" value={p.customer} />
              <Field label="Договор" value={`${p.contractNo} от ${fmtDate(p.contractDate)}`} />
              <Field label="Сумма" value={fmtMoney(p.contractSum)} />
              <Field label="Срок" value={fmtDate(p.deadline)} />
              <Field label="РП" value={p.manager} />
              <Field label="Готовность" value={`${p.progress}%`} />
            </dl>
          </div>
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/contracts">
                <FileSignature className="size-4" /> В договор
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/tasks" search={{ project: p.id, new: true }}>
                <Plus className="size-4" /> Создать задачу
              </Link>
            </Button>
            <Button size="sm" className="gap-1.5" asChild>
              <Link to="/mailings" search={{ project: p.id }}>
                <Mail className="size-4" /> Письмо заказчику
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <div className="-mx-4 mb-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <TabsList className="w-max">
            {tabs.map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="min-h-9 whitespace-nowrap">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel title="Контрольные точки">
            <ol className="space-y-3">
              {detail.milestones.map((m) => {
                const meta = milestoneMeta[m.status];
                return (
                  <li key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                    {m.status === "done" ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                    ) : (
                      <CircleDot
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          m.status === "overdue" && "text-danger",
                          m.status === "at_risk" && "text-warn",
                          m.status === "on_track" && "text-info",
                        )}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-table">{m.name}</div>
                      <div className="tnum text-caption text-text-muted">
                        {fmtDate(m.date)}
                        {m.note ? ` · ${m.note}` : ""}
                      </div>
                    </div>
                    <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <div className="grid gap-4">
            <Panel title="Ключевые цифры">
              <dl className="grid grid-cols-3 gap-3">
                <Key label="м² выполнено" value={fmtNum(p.areaDone)} sub={`из ${fmtNum(p.areaTotal)} м²`} />
                <Key label="Готовность" value={`${p.progress}%`} sub="от объема договора" />
                <Key
                  label="План-факт"
                  value={fmtPct(p.planFactDeviation)}
                  sub="отклонение к плану"
                  tone={p.planFactDeviation < 0 ? "danger" : "ok"}
                />
              </dl>
              <ProgressBar value={p.progress} tone={p.status} className="mt-4" />
            </Panel>

            <Panel title="Риски">
              <ul className="space-y-3">
                {detail.risks.map((r) => (
                  <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-table font-medium">{r.title}</span>
                        {r.fromAgent && (
                          <AgentSourceBadge
                            agent={r.fromAgent}
                            at="12 авг 2026, 07:05"
                            source="анализ графика и остатков"
                          />
                        )}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">{r.detail}</p>
                      <p className="mt-0.5 text-caption text-text-muted">Ответственный: {r.owner}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        toast.success("Напоминание отправлено (демо)", {
                          description: `${r.owner} получил бы уведомление в Telegram.`,
                        })
                      }
                    >
                      <Bell className="size-4" /> Напомнить
                    </Button>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          <Panel
            title="План-факт по этапам"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/schedule">Открыть график работ</Link>
              </Button>
            }
          >
            {schedule ? (
              <ul className="space-y-3">
                {schedule.stages.map((s) => {
                  const works = s.zones.flatMap((z) => z.works);
                  const progress = Math.round(
                    works.reduce((sum, w) => sum + w.progress, 0) / Math.max(1, works.length),
                  );
                  const planStart = works.map((w) => w.planStart).sort()[0]!;
                  const planEnd = works.map((w) => w.planEnd).sort().at(-1)!;
                  return (
                    <li key={s.id} className="grid grid-cols-1 gap-2 border-b border-border pb-3 last:border-0 lg:grid-cols-[minmax(0,1fr)_200px_120px] lg:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-table font-medium">{s.name}</div>
                        <div className="tnum text-caption text-text-muted">
                          {fmtDate(planStart)} — {fmtDate(planEnd)} · {works.length} работ
                        </div>
                      </div>
                      <ProgressBar value={progress} tone={progress >= 100 ? "done" : p.status} />
                      <span className="tnum text-caption text-text-secondary lg:text-right">{progress}% готово</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-caption text-text-muted">График по объекту еще не заведен.</p>
            )}
            <p className="mt-3 text-caption text-text-muted">
              План — из договора. Факт — из принятых отчётов прорабов.
            </p>
          </Panel>
        </TabsContent>

        <TabsContent value="tasks">
          <Panel title={`Задачи объекта · ${projectTasks.length}`} bodyClassName="p-0">
            <ul>
              {projectTasks.map((t) => (
                <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate text-table">{t.title}</div>
                    <div className="tnum text-caption text-text-muted">
                      {t.id} · {t.assignee} · до {fmtDate(t.dueDate)}
                    </div>
                  </div>
                  <StatusBadge tone={t.status === "done" ? "ok" : "neutral"}>
                    {taskStatusLabels[t.status]}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="reports">
          <Panel title={`Отчёты с объекта · ${projectReports.length}`} bodyClassName="p-0">
            <ul>
              {projectReports.map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate text-table">
                      {r.workType}, {fmtNum(r.volume)} {r.unit}
                    </div>
                    <div className="text-caption text-text-muted">
                      {r.author} · {r.zone} · {fmtDateTime(r.createdAt)}
                    </div>
                  </div>
                  <StatusBadge tone={r.status === "accepted" ? "ok" : r.status === "returned" ? "warn" : "info"}>
                    {reportStatusLabels[r.status]}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="docs">
          <Panel title={`Документы · ${projectDocs.length}`} bodyClassName="p-0">
            <ul>
              {projectDocs.map((d) => (
                <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate text-table">{d.name}</div>
                    <div className="text-caption text-text-muted">
                      {d.type} · {d.uploadedBy} · {fmtDate(d.uploadedAt)}
                    </div>
                  </div>
                  <span className="tnum text-caption text-text-muted">{d.pages} стр.</span>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="supply">
          <Panel title={`Заявки и поставки · ${projectPurchases.length}`} bodyClassName="p-0">
            {projectPurchases.length === 0 ? (
              <p className="px-4 py-6 text-caption text-text-muted">Заявок по объекту нет.</p>
            ) : (
              <ul>
                {projectPurchases.map((r) => (
                  <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <div className="tnum truncate text-table">{r.id}</div>
                      <div className="truncate text-caption text-text-muted">
                        {r.items.map((i) => i.nomenclature).join(", ")}
                      </div>
                    </div>
                    <StatusBadge tone="info">{purchaseStatusLabels[r.status]}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="zones">
          <Panel title="Схема фасада: захватки">
            <div className="grid max-w-lg grid-cols-3 gap-2">
              {detail.facade.map((c) => (
                <div
                  key={c.id}
                  className="flex min-h-16 flex-col justify-between rounded-md border border-border p-2"
                  style={{
                    background: `color-mix(in srgb, var(--accent) ${Math.max(6, c.progress)}%, var(--bg-surface))`,
                  }}
                >
                  <span className="text-caption text-text-secondary">{c.label}</span>
                  <span className="tnum text-table font-medium">{c.progress}%</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-caption text-text-muted">
              Цвет ячейки — процент готовности захватки. Данные синтетические.
            </p>
          </Panel>
        </TabsContent>

        <TabsContent value="finance">
          <Panel title="Финансы" bodyClassName="p-0">
            <ul>
              {detail.finance.map((f) => (
                <li key={f.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <div className="text-table">{f.label}</div>
                    <div className="text-caption text-text-muted">{f.hint}</div>
                  </div>
                  <span className="tnum text-table font-medium">{fmtMln(f.value)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="journal">
          <Panel title="Журнал действий" bodyClassName="p-0">
            <ul>
              {detail.journal.map((j) => (
                <li key={j.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border px-4 py-2.5 last:border-0">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <div className="text-table">{j.text}</div>
                    <div className="text-caption text-text-muted">
                      {j.actor}
                      {j.isAgent ? " · агент" : ""} · {fmtDateTime(j.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-overline text-text-muted">{label}</dt>
      <dd className="truncate text-table">{value}</dd>
    </div>
  );
}

function Key({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="min-w-0 rounded-md border border-border p-3">
      <div className="text-caption text-text-secondary">{label}</div>
      <div
        className={cn(
          "tnum mt-1 text-[22px] leading-none font-semibold",
          tone === "danger" && "text-danger",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-caption text-text-muted">{sub}</div>
    </div>
  );
}
