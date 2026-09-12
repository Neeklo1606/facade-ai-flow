import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileAudio,
  FileText,
  Mail,
  MessageSquare,
  Radio,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { inScope, useApp } from "@/lib/app-context";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { events } from "@/mock/events";
import { risks, tasks } from "@/mock/tasks";
import { requests } from "@/mock/supply";
import { sites } from "@/mock/sites";
import { userName } from "@/mock/users";
import type { Risk } from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Диспетчерская проекта — FACADE-RP" },
      { name: "description", content: "Терминал управленческих решений для фасадного строительства с прослеживаемыми AI-данными." },
      { property: "og:title", content: "Диспетчерская проекта — FACADE-RP" },
      { property: "og:description", content: "Риски, решения и происхождение каждого показателя строительного проекта." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommandCenter,
});

type Period = "shift" | "week" | "month";
const periods: { id: Period; label: string }[] = [
  { id: "shift", label: "Смена" },
  { id: "week", label: "7 дней" },
  { id: "month", label: "30 дней" },
];

const metricSeeds = [
  [14, 13, 13, 12, 14, 12, 11, 10],
  [5, 7, 6, 8, 7, 9, 8, 9],
  [17, 16, 18, 15, 13, 14, 12, 11],
  [61, 63, 62, 65, 67, 68, 70, 72],
  [8, 8, 7, 6, 6, 5, 5, 4],
];

function Sparkline({ data, alert = false }: { data: number[]; alert?: boolean }) {
  const min = Math.min(...data);
  const span = Math.max(...data) - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 70 + 1},${26 - ((v - min) / span) * 20}`).join(" ");
  return (
    <svg viewBox="0 0 72 30" className="h-[30px] w-[72px]" aria-hidden>
      <polyline points={points} fill="none" stroke={alert ? "var(--danger)" : "var(--accent)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx="71" cy={26 - ((data[data.length - 1] - min) / span) * 20} r="2" fill={alert ? "var(--danger)" : "var(--accent)"} />
    </svg>
  );
}

const severityLabel = { critical: "КРИТИЧНО", high: "ВЫСОКИЙ", medium: "СРЕДНИЙ", low: "НИЗКИЙ" } as const;

function DecisionRow({ risk, onOpen }: { risk: Risk; onOpen: (risk: Risk) => void }) {
  const site = sites.find((item) => item.id === risk.siteId);
  const critical = risk.severity === "critical";
  return (
    <button type="button" onClick={() => onOpen(risk)} className="decision-row group w-full text-left">
      <div className="flex min-w-0 items-center gap-3 lg:block">
        <span className={cn("signal-mark", critical ? "signal-mark-critical" : "signal-mark-warning")} aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("signal-label", critical ? "text-danger" : "text-warn")}>{severityLabel[risk.severity]}</span>
            <span className="mono text-micro text-text-muted">{risk.id.toUpperCase()}</span>
          </div>
          <p className="mt-1 font-medium text-text-primary">{risk.risk}</p>
          <p className="mt-1 line-clamp-2 text-dense text-text-secondary lg:hidden">{risk.cause}</p>
        </div>
      </div>
      <div className="hidden min-w-0 lg:block">
        <span className="terminal-label">Причина</span>
        <p className="mt-1 line-clamp-2 text-dense text-text-secondary">{risk.cause}</p>
      </div>
      <div className="min-w-0">
        <span className="terminal-label">Решение</span>
        <p className="mt-1 line-clamp-2 text-dense text-text-primary">{risk.action}</p>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-3 lg:block">
        <div>
          <span className="terminal-label">Ответственный</span>
          <p className="mt-1 truncate text-dense text-text-secondary">{userName(risk.ownerId)}</p>
        </div>
        <div className="lg:mt-3">
          <span className="terminal-label">Срок</span>
          <p className={cn("mono mt-1 text-dense", critical ? "text-danger" : "text-text-primary")}>{fmtDate(risk.dueDate)}</p>
        </div>
      </div>
      <div className="hidden items-center justify-end lg:flex">
        <span className="grid size-8 place-items-center rounded-full border border-border text-text-muted transition-colors group-hover:border-accent group-hover:text-accent">
          <ChevronRight className="size-4" />
        </span>
      </div>
      <div className="col-span-full mt-1 flex min-w-0 items-center gap-2 border-t border-border/70 pt-2 text-micro text-text-muted lg:mt-0">
        <Radio className="size-3 shrink-0 text-accent" />
        <span className="truncate">{site?.name} · {risk.sourceLabel}</span>
      </div>
    </button>
  );
}

function ProvenanceGraph({ risk, onClose }: { risk: Risk; onClose: () => void }) {
  const source = events.find((event) => event.id === risk.sourceEventId);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const nodes = [
    { eyebrow: "ИСТОЧНИК", title: source?.original.kind === "audio" ? "Голосовой отчёт" : source?.original.kind === "file" ? "Документ" : "Данные проекта", meta: source?.authorName ?? risk.sourceLabel, icon: source?.original.kind === "audio" ? FileAudio : FileText },
    { eyebrow: "AI-ОБРАБОТКА", title: "Извлечены сущности", meta: source ? `${source.fields.length} полей · уверенность ${source.confidence.toFixed(2)}` : "Сопоставление план-факт", icon: ScanLine },
    { eyebrow: "ФАКТ", title: risk.cause, meta: sites.find((site) => site.id === risk.siteId)?.name ?? "Объект", icon: ShieldCheck },
    { eyebrow: "РИСК", title: risk.risk, meta: severityLabel[risk.severity], icon: AlertTriangle },
    { eyebrow: "ДЕЙСТВИЕ", title: risk.action, meta: `${userName(risk.ownerId)} · ${fmtDate(risk.dueDate)}`, icon: CheckCircle2 },
  ];

  return (
    <div className="fixed inset-0 z-[70] bg-background/96 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Граф происхождения решения">
      <div className="flex h-full flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="terminal-label text-accent">Граф происхождения · {risk.id.toUpperCase()}</p>
            <h2 className="truncate text-heading">{risk.risk}</h2>
          </div>
          <Button variant="outline" size="icon" onClick={onClose} aria-label="Закрыть граф"><X /></Button>
        </header>
        <div className="blueprint-grid min-h-0 flex-1 overflow-auto p-4 lg:grid lg:place-items-center lg:p-10">
          <div className="mx-auto flex w-full max-w-[1480px] flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:justify-center">
            {nodes.map((node, index) => {
              const Icon = node.icon;
              return (
                <div key={node.eyebrow} className="contents">
                  <article className={cn("graph-node", index === 3 && "graph-node-alert", index === 4 && "graph-node-action")}>
                    <div className="flex items-start justify-between gap-4">
                      <span className="terminal-label">{node.eyebrow}</span>
                      <Icon className="size-4 shrink-0 text-text-muted" />
                    </div>
                    <p className="mt-6 text-[15px] font-medium leading-snug">{node.title}</p>
                    <p className="mono mt-3 text-micro text-text-muted">{node.meta}</p>
                  </article>
                  {index < nodes.length - 1 && <ArrowRight className="mx-auto size-5 shrink-0 rotate-90 text-accent lg:rotate-0" aria-hidden />}
                </div>
              );
            })}
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-border px-4 py-3 lg:px-8">
          <p className="text-caption text-text-muted">Связь подтверждена по журналу обработки. Данные синтетические.</p>
          <Button variant="accent" size="sm" asChild><Link to={risk.sourceEventId ? "/inbox" : "/risks"}>Открыть источник</Link></Button>
        </footer>
      </div>
    </div>
  );
}

function CommandCenter() {
  const { siteId, setAgentPanelOpen } = useApp();
  const [period, setPeriod] = useState<Period>("week");
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const scopedRisks = inScope(risks, siteId);
  const scopedTasks = inScope(tasks, siteId);
  const scopedEvents = inScope(events, siteId);
  const scopedRequests = inScope(requests, siteId);
  const metrics = useMemo(() => [
    { label: "Критические решения", value: scopedRisks.filter((risk) => risk.severity === "critical").length, delta: "+2", alert: true },
    { label: "Просрочено задач", value: scopedTasks.filter((task) => task.status === "overdue").length, delta: "+1", alert: true },
    { label: "Требуют проверки", value: scopedEvents.filter((event) => event.status === "review" || event.status === "extracted").length, delta: "−3", alert: false },
    { label: "Поток подтверждён", value: "72%", delta: "+4,8", alert: false },
    { label: "Заявок без ответа", value: scopedRequests.filter((request) => request.repliesCount === 0 && request.status !== "draft").length, delta: "−1", alert: false },
  ], [scopedEvents, scopedRequests, scopedRisks, scopedTasks]);

  return (
    <div className="terminal-page -mx-4 -my-5 min-h-full md:-mx-7 md:-my-6">
      <header className="flex flex-col gap-4 border-b border-border px-4 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
        <div>
          <div className="flex items-center gap-2"><span className="pulse-dot size-2 rounded-full bg-ok" /><span className="terminal-label">СИСТЕМА В НОРМЕ · 05 СЕН 2026 · 13:42</span></div>
          <h1 className="mt-2 text-title">Диспетчерская проекта</h1>
          <p className="mt-1 max-w-2xl text-dense text-text-secondary">Решения, требующие внимания. Каждый сигнал связан с исходным сообщением, документом или фактом.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="segmented-control" aria-label="Период">
            {periods.map((item) => <button key={item.id} type="button" onClick={() => setPeriod(item.id)} className={cn("segment", period === item.id && "segment-active")}>{item.label}</button>)}
          </div>
          <Button variant="accent" size="sm" onClick={() => setAgentPanelOpen(true)}><Sparkles />Поручить агенту</Button>
        </div>
      </header>

      <section className="metric-strip" aria-label="Оперативные показатели">
        {metrics.map((metric, index) => (
          <article key={metric.label} className="terminal-metric">
            <div className="min-w-0"><p className="terminal-label truncate">{metric.label}</p><div className="mt-1 flex items-baseline gap-2"><strong className={cn("mono text-display", metric.alert && "text-danger")}>{metric.value}</strong><span className={cn("mono text-micro", metric.alert ? "text-danger" : "text-ok")}>{metric.delta}</span></div></div>
            <Sparkline data={metricSeeds[index]} alert={metric.alert} />
          </article>
        ))}
      </section>

      <div className="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 border-border xl:border-r">
          <div className="flex h-11 items-center justify-between border-b border-border px-4 lg:px-6"><div className="flex items-center gap-2"><h2 className="text-label">ОЧЕРЕДЬ РЕШЕНИЙ</h2><span className="mono text-micro text-text-muted">{scopedRisks.length}</span></div><Link to="/risks" className="text-caption text-text-secondary hover:text-accent">Все риски →</Link></div>
          <div className="hidden grid-cols-[minmax(230px,1.2fr)_minmax(200px,1fr)_minmax(230px,1.1fr)_150px_40px] gap-4 border-b border-border bg-raised/60 px-6 py-2 lg:grid">
            {["Сигнал", "Причина", "Решение", "Контроль", ""].map((label) => <span key={label} className="terminal-label">{label}</span>)}
          </div>
          <div className="divide-y divide-border">{scopedRisks.map((risk) => <DecisionRow key={risk.id} risk={risk} onOpen={setSelectedRisk} />)}</div>
        </section>

        <aside className="min-w-0 border-t border-border xl:border-t-0">
          <div className="flex h-11 items-center justify-between border-b border-border px-4"><div className="flex items-center gap-2"><span className="pulse-dot size-1.5 rounded-full bg-accent" /><h2 className="text-label">ЖИВОЙ ПОТОК</h2></div><Link to="/inbox" className="text-caption text-text-secondary hover:text-accent">Входящие</Link></div>
          <ol className="divide-y divide-border">
            {scopedEvents.slice(0, 8).map((event) => {
              const Icon = event.channel === "telegram" ? MessageSquare : event.channel === "email" ? Mail : Upload;
              return <li key={event.id} className="px-4 py-3 transition-colors hover:bg-hover"><div className="flex items-center gap-2"><Icon className="size-3.5 text-text-muted" /><time className="mono text-micro text-text-muted">{fmtDateTime(event.at)}</time><span className="ml-auto"><ConfidenceIndicator value={event.confidence} /></span></div><p className="mt-2 line-clamp-2 text-dense leading-relaxed">{event.preview}</p><div className="mt-2 flex items-center gap-2"><span className="mono text-micro text-accent">{event.id.toUpperCase()}</span><span className="truncate text-micro text-text-muted">{event.authorName}</span></div></li>;
            })}
          </ol>
        </aside>
      </div>
      <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-micro text-text-muted lg:px-6"><span>Данные синтетические · прототип интерфейса</span><span className="mono hidden sm:inline">FACADE-RP / COMMAND 01</span></footer>
      {selectedRisk && <ProvenanceGraph risk={selectedRisk} onClose={() => setSelectedRisk(null)} />}
    </div>
  );
}
