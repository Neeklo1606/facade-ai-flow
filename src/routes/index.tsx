import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Globe,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { ProgressRing } from "@/components/common/ProgressRing";
import { OriginalSourceDrawer, channelName } from "@/components/common/OriginalSourceDrawer";
import { ProvenanceCanvas } from "@/components/graph/ProvenanceCanvas";
import { ALL_SITES, inScope, useApp } from "@/lib/app-context";
import { fmtDate, fmtDateTime, fmtMln, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { events } from "@/mock/events";
import { risks, tasks } from "@/mock/tasks";
import { requests } from "@/mock/supply";
import { sites } from "@/mock/sites";
import { userName } from "@/mock/users";
import { projectFinance } from "@/mock/repository";
import type { EventChannel, FieldEvent, Risk } from "@/types";

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

const channelIcons: Record<EventChannel, typeof Mail> = {
  telegram: MessageSquare,
  email: Mail,
  upload: Upload,
  web: Globe,
  telephony: Phone,
};

const severityLabel = { critical: "КРИТИЧНО", high: "ВЫСОКИЙ", medium: "СРЕДНИЙ", low: "НИЗКИЙ" } as const;

/** Идентификатор объекта в реестре проектов, откуда берутся деньги и объёмы. */
function projectIdOf(siteId: string) {
  return siteId.replace(/^s-/, "p-");
}

function DecisionRow({
  risk,
  onOpen,
  onOpenSource,
}: {
  risk: Risk;
  onOpen: (risk: Risk) => void;
  onOpenSource: (event: FieldEvent) => void;
}) {
  const site = sites.find((item) => item.id === risk.siteId);
  const critical = risk.severity === "critical";
  const source = events.find((event) => event.id === risk.sourceEventId);
  const SourceIcon = source ? channelIcons[source.channel] : Upload;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(risk)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(risk);
        }
      }}
      className="decision-row group w-full cursor-pointer text-left"
    >
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
      <div className="min-w-0">
        <span className="terminal-label">Источник</span>
        {source ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSource(source);
            }}
            className="mt-1 flex w-full min-w-0 items-start gap-2 text-left text-dense text-text-secondary transition-colors hover:text-accent"
            title="Открыть оригинал"
          >
            <SourceIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2 underline decoration-dotted underline-offset-2">{risk.sourceLabel}</span>
          </button>
        ) : (
          <p className="mt-1 line-clamp-2 text-dense text-text-muted">{risk.sourceLabel}</p>
        )}
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
        <span className="truncate">{site?.name}</span>
      </div>
    </div>
  );
}

function ProvenanceGraph({ risk, onClose }: { risk: Risk; onClose: () => void }) {
  const source = events.find((event) => event.id === risk.sourceEventId);
  const siteName = sites.find((site) => site.id === risk.siteId)?.name ?? "Объект";
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="provenance-overlay fixed inset-0 z-[70] bg-background/96 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Граф происхождения решения">
      <div className="flex h-full flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="terminal-label text-accent">Граф происхождения · {risk.id.toUpperCase()}</p>
            <h2 className="truncate text-heading">{risk.risk}</h2>
          </div>
          <Button variant="outline" size="icon" onClick={onClose} aria-label="Закрыть граф"><X /></Button>
        </header>
        <div className="min-h-0 flex-1"><ProvenanceCanvas risk={risk} source={source} siteName={siteName} /></div>
        <footer className="flex shrink-0 items-center justify-between border-t border-border px-4 py-3 lg:px-8">
          <p className="text-caption text-text-muted">Связь подтверждена по журналу обработки. Данные синтетические.</p>
          <Button variant="accent" size="sm" asChild><Link to={risk.sourceEventId ? "/inbox" : "/risks"} search={{ status: undefined, channel: undefined, severity: undefined, kind: undefined }}>Открыть источник</Link></Button>
        </footer>
      </div>
    </div>
  );
}

function CommandCenter() {
  const { siteId, user, setAgentPanelOpen } = useApp();
  const [period, setPeriod] = useState<Period>("week");
  const [ownScope, setOwnScope] = useState<"mine" | "all">("mine");
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const [sourceEvent, setSourceEvent] = useState<FieldEvent | null>(null);

  const allowedSites = useMemo(
    () => (ownScope === "mine" ? (user?.siteIds ?? []) : sites.map((item) => item.id)),
    [ownScope, user],
  );

  function scoped<T extends { siteId: string | null }>(items: T[]) {
    const byOwn = siteId === ALL_SITES ? items.filter((i) => i.siteId && allowedSites.includes(i.siteId)) : items;
    return inScope(byOwn, siteId);
  }

  const scopedRisks = scoped(risks);
  const scopedTasks = scoped(tasks);
  const scopedEvents = scoped(events);
  const scopedRequests = scoped(requests);

  const unclosed = useMemo(() => {
    const ids = siteId === ALL_SITES ? allowedSites : [siteId];
    return ids
      .map((id) => projectFinance(projectIdOf(id)))
      .reduce(
        (acc, item) => ({ value: acc.value + item.unclosedValue, qty: acc.qty + item.unclosedAmount }),
        { value: 0, qty: 0 },
      );
  }, [allowedSites, siteId]);

  const criticalCount = scopedRisks.filter((risk) => risk.severity === "critical").length;
  const confirmedPct = 72;

  return (
    <div className="terminal-page -mx-4 -my-5 min-h-full md:-mx-7 md:-my-6">
      <header className="flex flex-col gap-4 border-b border-border px-4 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
        <div>
          <div className="flex items-center gap-2"><span className="pulse-dot size-2 rounded-full bg-ok" /><span className="terminal-label">Смена от 05 сентября 2026</span></div>
          <h1 className="mt-2 text-title">Диспетчерская проекта</h1>
          <p className="mt-1 max-w-2xl text-dense text-text-secondary">Решения, требующие внимания. Каждый показатель связан с исходным сообщением, документом или фактом.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented-control" aria-label="Охват объектов">
            <button type="button" onClick={() => setOwnScope("mine")} className={cn("segment", ownScope === "mine" && "segment-active")}>Мои объекты</button>
            <button type="button" onClick={() => setOwnScope("all")} className={cn("segment", ownScope === "all" && "segment-active")}>Все объекты</button>
          </div>
          <div className="segmented-control" aria-label="Период">
            {periods.map((item) => <button key={item.id} type="button" onClick={() => setPeriod(item.id)} className={cn("segment", period === item.id && "segment-active")}>{item.label}</button>)}
          </div>
          <Button variant="accent" size="sm" onClick={() => setAgentPanelOpen(true)}><Sparkles />Поручить агенту</Button>
        </div>
      </header>

      <section className="metric-strip items-center" aria-label="Оперативные показатели">
        <Link to="/risks" search={{ kind: "unclosed_volume", severity: undefined }} className="terminal-metric focus-ring text-left transition-colors hover:bg-hover">
          <div className="min-w-0">
            <p className="terminal-label truncate">Незакрытый объём</p>
            <strong className="mono mt-1 block text-display text-danger">{fmtMln(unclosed.value)}</strong>
            <p className="mt-1 text-micro text-text-muted">{fmtNum(unclosed.qty)} м² по облицовке</p>
          </div>
        </Link>

        <Link to="/risks" search={{ severity: "critical", kind: undefined }} className="terminal-metric focus-ring text-left transition-colors hover:bg-hover">
          <div className="min-w-0">
            <p className="terminal-label truncate">Критические решения</p>
            <strong className="mono mt-1 block text-display text-danger">{criticalCount}</strong>
            <p className="mt-1 text-micro text-text-muted">Открыть реестр рисков</p>
          </div>
        </Link>

        <Link to="/tasks" search={{ status: "overdue" }} className="terminal-metric focus-ring text-left transition-colors hover:bg-hover">
          <div className="min-w-0">
            <p className="terminal-label truncate">Просрочено задач</p>
            <strong className="mono mt-1 block text-display text-danger">{scopedTasks.filter((task) => task.status === "overdue").length}</strong>
            <p className="mt-1 text-micro text-text-muted">Открыть задачи с просрочкой</p>
          </div>
        </Link>

        <Link to="/inbox" search={{ status: "review", channel: undefined }} className="terminal-metric focus-ring text-left transition-colors hover:bg-hover">
          <div className="min-w-0">
            <p className="terminal-label truncate">Требуют проверки</p>
            <strong className="mono mt-1 block text-display">{scopedEvents.filter((event) => event.status === "review" || event.status === "extracted").length}</strong>
            <p className="mt-1 text-micro text-text-muted">Открыть входящие без проверки</p>
          </div>
        </Link>

        <Link to="/requests" search={{ status: "no_reply" }} className="terminal-metric focus-ring text-left transition-colors hover:bg-hover">
          <div className="min-w-0">
            <p className="terminal-label truncate">Заявок без ответа</p>
            <strong className="mono mt-1 block text-display">{scopedRequests.filter((request) => request.repliesCount === 0 && request.status !== "draft").length}</strong>
            <p className="mt-1 text-micro text-text-muted">Открыть заявки поставщикам</p>
          </div>
        </Link>
      </section>

      <section className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-border px-4 py-4 lg:px-6" aria-label="Сводные показатели">
        <div className="flex items-center gap-3">
          <ProgressRing value={confirmedPct} status={confirmedPct >= 70 ? "ok" : "warn"} label="поток" threshold={70} />
          <div className="min-w-0">
            <p className="terminal-label">Поток подтверждён</p>
            <p className="mt-1 text-micro text-text-muted">Доля проверенных человеком данных</p>
          </div>
        </div>
        <span className="hidden h-10 w-px bg-border/60 lg:block" aria-hidden />
        <div className="flex items-center gap-3">
          <ProgressRing value={criticalCount} status={criticalCount > 0 ? "danger" : "ok"} label="критич." threshold={1} />
          <div className="min-w-0">
            <p className="terminal-label">Критические</p>
            <p className="mt-1 text-micro text-text-muted">Решения со сроком в ближайшие дни</p>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 border-border xl:border-r">
          <div className="flex h-11 items-center justify-between border-b border-border px-4 lg:px-6"><div className="flex items-center gap-2"><h2 className="text-label">Очередь решений</h2><span className="mono text-micro text-text-muted">{scopedRisks.length}</span></div><Link to="/risks" search={{ severity: undefined, kind: undefined }} className="text-caption text-text-secondary hover:text-accent">Все риски →</Link></div>
          <div className="hidden grid-cols-[minmax(210px,1.1fr)_minmax(180px,1fr)_minmax(200px,1fr)_minmax(170px,0.9fr)_150px_40px] gap-4 border-b border-border bg-raised/60 px-6 py-2 lg:grid">
            {["Риск", "Причина", "Решение", "Источник", "Контроль", ""].map((label) => <span key={label} className="terminal-label">{label}</span>)}
          </div>
          <div className="divide-y divide-border">{scopedRisks.map((risk) => <DecisionRow key={risk.id} risk={risk} onOpen={setSelectedRisk} onOpenSource={setSourceEvent} />)}</div>
        </section>

        <aside className="min-w-0 border-t border-border xl:border-t-0">
          <div className="flex h-11 items-center justify-between border-b border-border px-4"><div className="flex items-center gap-2"><span className="pulse-dot size-1.5 rounded-full bg-accent" /><h2 className="text-label">Живой поток</h2></div><Link to="/inbox" search={{ status: undefined, channel: undefined }} className="text-caption text-text-secondary hover:text-accent">Входящие</Link></div>
          <ol className="divide-y divide-border">
            {scopedEvents.slice(0, 8).map((event) => {
              const Icon = channelIcons[event.channel];
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setSourceEvent(event)}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-hover"
                    title={`Открыть оригинал: ${channelName(event.channel)}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5 text-text-muted" />
                      <time className="mono text-micro text-text-muted">{fmtDateTime(event.at)}</time>
                      <span className="ml-auto"><ConfidenceIndicator value={event.confidence} /></span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-dense leading-relaxed">{event.preview}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-micro text-accent">{channelName(event.channel)}</span>
                      <span className="truncate text-micro text-text-muted">{event.authorName}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
      <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-micro text-text-muted lg:px-6"><span>Данные синтетические · прототип интерфейса</span></footer>
      {selectedRisk && <ProvenanceGraph risk={selectedRisk} onClose={() => setSelectedRisk(null)} />}
      <OriginalSourceDrawer event={sourceEvent} onOpenChange={(open) => !open && setSourceEvent(null)} />
    </div>
  );
}
