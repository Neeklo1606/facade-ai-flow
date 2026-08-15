import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, ChevronDown, ChevronRight, Info } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projects } from "@/mock/projects";
import { getSchedule, weeklyPlanFact, type WorkItem } from "@/mock/schedule";
import { fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "График работ — ФАСАД-РП" },
      { name: "description", content: "Гант по этапам и захваткам: план из договора, факт из принятых отчётов." },
      { property: "og:title", content: "График работ — ФАСАД-РП" },
      { property: "og:description", content: "Гант по этапам и захваткам: план из договора, факт из принятых отчётов." },
    ],
  }),
  component: SchedulePage,
});

const TODAY = new Date("2026-08-12");
const DAY = 86_400_000;

const d = (s: string) => new Date(s).getTime();

type Row =
  | { kind: "stage"; id: string; name: string; start: number; end: number; progress: number; depth: 0 }
  | { kind: "zone"; id: string; name: string; start: number; end: number; progress: number; depth: 1; parent: string }
  | {
      kind: "work";
      id: string;
      name: string;
      start: number;
      end: number;
      progress: number;
      depth: 2;
      parent: string;
      work: WorkItem;
    };

function workStatus(w: WorkItem): { tone: StatusTone; label: string } {
  if (w.progress >= 100) {
    const late = w.factEnd && d(w.factEnd) > d(w.planEnd);
    return late ? { tone: "warn", label: "Выполнено с опозданием" } : { tone: "ok", label: "Выполнено" };
  }
  if (d(w.planEnd) < TODAY.getTime()) return { tone: "danger", label: "Просрочено" };
  if (w.factStart && d(w.factStart) < d(w.planStart)) return { tone: "ok", label: "С опережением" };
  if (w.factStart) return { tone: "info", label: "В работе" };
  return { tone: "neutral", label: "Не начата" };
}

function SchedulePage() {
  const [projectId, setProjectId] = useState(projects[0]!.id);
  const [period, setPeriod] = useState("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const schedule = getSchedule(projectId);

  const rows = useMemo<Row[]>(() => {
    if (!schedule) return [];
    const out: Row[] = [];
    for (const st of schedule.stages) {
      const works = st.zones.flatMap((z) => z.works);
      const stStart = Math.min(...works.map((w) => d(w.planStart)));
      const stEnd = Math.max(...works.map((w) => d(w.planEnd)));
      out.push({
        kind: "stage",
        id: st.id,
        name: st.name,
        start: stStart,
        end: stEnd,
        progress: Math.round(works.reduce((s, w) => s + w.progress, 0) / works.length),
        depth: 0,
      });
      if (collapsed[st.id]) continue;
      for (const z of st.zones) {
        const zStart = Math.min(...z.works.map((w) => d(w.planStart)));
        const zEnd = Math.max(...z.works.map((w) => d(w.planEnd)));
        out.push({
          kind: "zone",
          id: z.id,
          name: z.name,
          start: zStart,
          end: zEnd,
          progress: Math.round(z.works.reduce((s, w) => s + w.progress, 0) / z.works.length),
          depth: 1,
          parent: st.id,
        });
        if (collapsed[z.id]) continue;
        for (const w of z.works) {
          out.push({
            kind: "work",
            id: w.id,
            name: w.name,
            start: d(w.planStart),
            end: d(w.planEnd),
            progress: w.progress,
            depth: 2,
            parent: z.id,
            work: w,
          });
        }
      }
    }
    return out;
  }, [schedule, collapsed]);

  const allWorks = useMemo(
    () => schedule?.stages.flatMap((s) => s.zones.flatMap((z) => z.works)) ?? [],
    [schedule],
  );

  const bounds = useMemo(() => {
    if (allWorks.length === 0) return { min: TODAY.getTime(), max: TODAY.getTime() + DAY };
    const times = allWorks.flatMap((w) => [
      d(w.planStart),
      d(w.planEnd),
      ...(w.factStart ? [d(w.factStart)] : []),
      ...(w.factEnd ? [d(w.factEnd)] : []),
    ]);
    let min = Math.min(...times);
    const max = Math.max(...times);
    if (period === "quarter") min = Math.max(min, TODAY.getTime() - 90 * DAY);
    return { min, max };
  }, [allWorks, period]);

  const span = Math.max(bounds.max - bounds.min, DAY);
  const pct = (t: number) => ((t - bounds.min) / span) * 100;
  const todayLeft = pct(TODAY.getTime());
  const weeks = weeklyPlanFact[projectId] ?? [];

  const months = useMemo(() => {
    const out: { label: string; left: number }[] = [];
    const cur = new Date(bounds.min);
    cur.setDate(1);
    while (cur.getTime() <= bounds.max) {
      out.push({
        label: cur.toLocaleDateString("ru-RU", { month: "short" }),
        left: Math.max(0, pct(cur.getTime())),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.min, bounds.max]);

  return (
    <>
      <PageHeader
        title="График работ"
        description="План — из договора, факт — из принятых отчётов. Данные синтетические."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-9 w-64"><SelectValue placeholder="Объект" /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Период" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Весь срок договора</SelectItem>
            <SelectItem value="quarter">Последний квартал</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-caption text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-full bg-[color:var(--text-muted)]/45" /> план (из договора)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-full bg-accent" /> факт (из принятых отчётов)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-full bg-danger" /> отставание
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-full bg-ok" /> опережение
          </span>
        </span>
      </div>

      {!schedule ? (
        <Panel bodyClassName="p-0">
          <EmptyState icon={CalendarRange} title="График не задан" description="Для объекта нет плана работ." />
        </Panel>
      ) : (
        <>
          {/* Десктоп: Гант + таблица справа */}
          <Panel bodyClassName="p-0" className="hidden lg:block">
            <div className="grid grid-cols-[320px_minmax(0,1fr)_200px]">
              <div className="border-r border-border">
                <div className="h-9 border-b border-border px-3 text-overline leading-9 text-text-muted">
                  Этап / захватка / работа
                </div>
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      "flex h-9 items-center gap-1.5 border-b border-border px-3 text-table",
                      r.kind === "stage" && "bg-subtle font-medium",
                    )}
                    style={{ paddingLeft: 12 + r.depth * 14 }}
                  >
                    {r.kind !== "work" ? (
                      <button
                        className="shrink-0 text-text-muted"
                        aria-label="Свернуть"
                        onClick={() => setCollapsed((c) => ({ ...c, [r.id]: !c[r.id] }))}
                      >
                        {collapsed[r.id] ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <span className="truncate">{r.name}</span>
                    {r.kind === "work" && r.work.critical && (
                      <span className="ml-1 shrink-0 rounded-sm bg-danger-bg px-1 text-[11px] leading-4 text-text-primary">
                        крит. путь
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="relative overflow-hidden">
                <div className="relative h-9 border-b border-border">
                  {months.map((m) => (
                    <span
                      key={m.label + m.left}
                      className="absolute top-0 border-l border-border pl-1 text-caption leading-9 text-text-muted"
                      style={{ left: `${m.left}%` }}
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
                <div
                  className="pointer-events-none absolute bottom-0 top-9 z-10 w-px bg-accent"
                  style={{ left: `${todayLeft}%` }}
                >
                  <span className="absolute -top-0.5 left-1 rounded-sm bg-accent px-1 text-[11px] leading-4 text-[color:var(--accent-fg)]">
                    сегодня
                  </span>
                </div>
                {rows.map((r) => {
                  const w = r.kind === "work" ? r.work : null;
                  const late = w?.factEnd ? d(w.factEnd) > d(w.planEnd) : false;
                  const ahead = w?.factEnd ? d(w.factEnd) < d(w.planEnd) : false;
                  const factStart = w?.factStart ? pct(d(w.factStart)) : null;
                  const factEnd = w ? pct(d(w.factEnd ?? TODAY.toISOString())) : null;
                  return (
                    <div key={r.id} className="relative h-9 border-b border-border">
                      <span
                        className={cn(
                          "absolute rounded-full bg-[color:var(--text-muted)]/40",
                          r.kind === "work" ? "top-2 h-2" : "top-3.5 h-2.5",
                          r.kind === "stage" && "bg-[color:var(--text-muted)]/55",
                        )}
                        style={{ left: `${pct(r.start)}%`, width: `${Math.max(pct(r.end) - pct(r.start), 0.6)}%` }}
                      />
                      {w && factStart !== null && factEnd !== null && (
                        <span
                          className={cn(
                            "absolute top-5 h-2 rounded-full",
                            late ? "bg-danger" : ahead ? "bg-ok" : "bg-accent",
                            w.critical && "ring-1 ring-danger",
                          )}
                          style={{ left: `${factStart}%`, width: `${Math.max(factEnd - factStart, 0.6)}%` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-l border-border">
                <div className="grid h-9 grid-cols-[minmax(0,1fr)_56px] items-center gap-2 border-b border-border px-3 text-overline text-text-muted">
                  <span>Даты плана</span>
                  <span className="text-right">%</span>
                </div>
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      "grid h-9 grid-cols-[minmax(0,1fr)_56px] items-center gap-2 border-b border-border px-3",
                      r.kind === "stage" && "bg-subtle",
                    )}
                  >
                    <span className="tnum truncate text-caption text-text-secondary">
                      {fmtDateShort(new Date(r.start))} – {fmtDateShort(new Date(r.end))}
                    </span>
                    <span className="tnum text-right text-table">{r.progress}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Мобильные: Гант со скроллом + список этапов */}
          <div className="lg:hidden">
            <Panel title="Гант" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <div className="min-w-[720px] p-3">
                  {rows.map((r) => (
                    <div key={r.id} className="mb-2">
                      <div className="mb-1 truncate text-caption" style={{ paddingLeft: r.depth * 12 }}>
                        {r.name}
                      </div>
                      <div className="relative h-4 rounded-sm bg-subtle">
                        <span
                          className="absolute top-0.5 h-1.5 rounded-full bg-[color:var(--text-muted)]/45"
                          style={{ left: `${pct(r.start)}%`, width: `${Math.max(pct(r.end) - pct(r.start), 0.8)}%` }}
                        />
                        <span className="absolute inset-y-0 w-px bg-accent" style={{ left: `${todayLeft}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Этапы" className="mt-3">
              <ul className="space-y-2.5">
                {schedule.stages.map((st) => {
                  const works = st.zones.flatMap((z) => z.works);
                  const progress = Math.round(works.reduce((s, w) => s + w.progress, 0) / works.length);
                  const overdue = works.filter((w) => w.progress < 100 && d(w.planEnd) < TODAY.getTime()).length;
                  return (
                    <li key={st.id} className="card-surface p-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <span className="truncate text-table font-medium">{st.name}</span>
                        <StatusBadge tone={overdue ? "danger" : progress === 100 ? "ok" : "info"}>
                          {overdue ? `Просрочено: ${overdue}` : progress === 100 ? "Выполнен" : "В работе"}
                        </StatusBadge>
                      </div>
                      <ProgressBar className="mt-2" value={progress} tone={overdue ? "danger" : "ok"} />
                      <div className="tnum mt-1.5 text-caption text-text-muted">{progress}% · работ: {works.length}</div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <Panel
            className="mt-3"
            title="План-факт по неделям, м² (факт — по принятым отчётам)"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="plan" name="План" stroke="var(--text-muted)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fact" name="Факт" stroke="var(--accent)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="mt-3" title="Статусы работ">
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {allWorks.map((w) => {
                const st = workStatus(w);
                return (
                  <li key={w.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-subtle px-2.5 py-2">
                    <span className="truncate text-caption">{w.name}</span>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-caption text-text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              План — из договора №{" "}
              {projects.find((p) => p.id === projectId)?.contractNo ?? "—"}; факт — из принятых отчётов.
            </p>
          </Panel>
        </>
      )}

      <div className="mt-3 lg:hidden">
        <Button variant="outline" size="sm" className="w-full">Данные синтетические</Button>
      </div>
    </>
  );
}
