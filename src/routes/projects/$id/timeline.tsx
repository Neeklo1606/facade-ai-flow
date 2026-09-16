import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowRight,
  Bot,
  ChevronDown,
  FilePlus2,
  FileSearch,
  Gavel,
  HardHat,
  History,
  PackageCheck,
  PencilLine,
  Send,
  ShoppingCart,
  ThumbsUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { loadProject, ProjectNotFound } from "@/components/project/ProjectNotFound";
import { SubpageHeader } from "@/components/project/SubpageHeader";
import { FilterSelect } from "@/components/common/FilterSelect";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { SourceDrawer, SourceRef } from "@/components/common/SourceRef";
import { Button } from "@/components/ui/button";
import {
  employeeById,
  employeeName,
  timelineTypeLabel,
  type ProjectDecision,
  type TimelineEventType,
} from "@/mock/repository";
import { timelineOf, useSpecStore } from "@/lib/spec-store";
import { useScreenState } from "@/lib/screen-state";
import { fmtDateTime, fmtDayTitle, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TimelineSearch {
  type?: TimelineEventType | undefined;
  author?: string | undefined;
}

export const Route = createFileRoute("/projects/$id/timeline")({
  validateSearch: (search: Record<string, unknown>): TimelineSearch => ({
    type:
      typeof search["type"] === "string" && search["type"] in timelineTypeLabel
        ? (search["type"] as TimelineEventType)
        : undefined,
    author: typeof search["author"] === "string" && search["author"] ? search["author"] : undefined,
  }),
  loader: ({ params }) => loadProject(params.id),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `История и решения — ${loaderData.project.name} — neeklo FieldOps` }]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: TimelinePage,
});

const typeStyle: Record<TimelineEventType, { icon: LucideIcon; tone: string }> = {
  version_uploaded: { icon: FilePlus2, tone: "bg-info-bg text-info" },
  spec_extracted: { icon: FileSearch, tone: "bg-info-bg text-info" },
  qty_corrected: { icon: PencilLine, tone: "bg-warn-bg text-warn" },
  request_created: { icon: Send, tone: "bg-subtle text-text-secondary" },
  offer_received: { icon: PackageCheck, tone: "bg-accent-subtle text-accent" },
  replacement_proposed: { icon: ArrowLeftRight, tone: "bg-warn-bg text-warn" },
  replacement_agreed: { icon: ThumbsUp, tone: "bg-ok-bg text-ok" },
  material_ordered: { icon: ShoppingCart, tone: "bg-accent-subtle text-accent" },
  delivery_received: { icon: Truck, tone: "bg-ok-bg text-ok" },
  report_added: { icon: HardHat, tone: "bg-subtle text-text-secondary" },
  decision: { icon: Gavel, tone: "bg-ok-bg text-ok" },
};

function TimelinePage() {
  const { project } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const state = useSpecStore((s) => s);
  const [source, setSource] = useState<string | null>(null);
  const [showAllDecisions, setShowAllDecisions] = useState(false);

  const events = useMemo(() => timelineOf(state, project.id), [state, project.id]);
  const decisions = useMemo(
    () =>
      state.decisions
        .filter((d) => d.projectId === project.id)
        .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)),
    [state.decisions, project.id],
  );
  const filtered = events
    .filter((e) => (search.type ? e.type === search.type : true))
    .filter((e) => (search.author ? e.actorId === search.author : true));

  const days = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const event of filtered) {
      const key = event.at.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return [...map.entries()];
  }, [filtered]);

  const authors = [...new Set(events.map((e) => e.actorId))];
  const setSearch = (patch: Partial<TimelineSearch>) =>
    navigate({
      search: (prev: TimelineSearch) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    });
  const reset = () => setSearch({ type: undefined, author: undefined });

  const screen = useScreenState({
    empty: events.length === 0,
    filtered: filtered.length === 0,
    partial: events.length > 0 && project.id !== "p-korona",
  });

  return (
    <>
      <SubpageHeader
        project={project}
        title="История и решения"
        description="Что происходило на объекте, кто принимал решения и на каком основании."
      />

      {screen !== "loading" &&
        screen !== "error" &&
        screen !== "forbidden" &&
        screen !== "empty" &&
        decisions.length > 0 && (
          <section className="mb-5" aria-labelledby="decisions-title">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2
                id="decisions-title"
                className="flex items-center gap-2 text-[15px] font-semibold"
              >
                <Gavel className="size-4 text-text-muted" /> Решения
                <span className="tnum text-caption font-normal text-text-muted">
                  {decisions.length}
                </span>
              </h2>
              {decisions.length > 2 && (
                <Button size="sm" variant="ghost" onClick={() => setShowAllDecisions((v) => !v)}>
                  {showAllDecisions ? "Свернуть" : `Все решения · ${decisions.length}`}
                  <ChevronDown
                    className={cn("size-4 transition-transform", showAllDecisions && "rotate-180")}
                  />
                </Button>
              )}
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {(showAllDecisions ? decisions : decisions.slice(0, 2)).map((decision) => (
                <DecisionCard key={decision.id} decision={decision} onSource={setSource} />
              ))}
            </div>
          </section>
        )}

      <section className="card-surface overflow-hidden">
        <div className="grid grid-cols-1 gap-2 border-b border-border px-4 py-2.5 sm:flex sm:flex-wrap sm:items-center">
          <FilterSelect
            label="Тип"
            allLabel="Все события"
            value={search.type}
            options={(Object.keys(timelineTypeLabel) as TimelineEventType[]).map((t) => ({
              value: t,
              label: timelineTypeLabel[t],
            }))}
            onChange={(type) => setSearch({ type: type as TimelineEventType | undefined })}
          />
          <FilterSelect
            label="Автор"
            allLabel="Все авторы"
            value={search.author}
            options={authors.map((id) => ({
              value: id,
              label: employeeById(id)?.name ?? "Автоматическая обработка",
            }))}
            onChange={(author) => setSearch({ author })}
          />
          <span className="text-caption text-text-muted sm:ml-auto">
            Событий: {filtered.length}
          </span>
        </div>

        {screen === "partial" && (
          <div className="p-4 pb-0">
            <StateBanner tone="warn" title="История неполная">
              События до подключения объекта к системе не загружены. Показаны только запросы и
              отчёты, пришедшие через систему.
            </StateBanner>
          </div>
        )}
        {screen === "processing" && (
          <div className="p-4 pb-0">
            <StateBanner
              tone="info"
              title="Добавляем события из почты и Telegram за последний час"
            />
          </div>
        )}

        <ScreenGate
          state={screen}
          skeleton={
            <div className="p-4">
              <ScreenSkeleton kind="feed" />
            </div>
          }
          copy={{
            section: "История и решения",
            roles: "руководителю проекта и генеральному директору",
            errorTitle: "Не удалось загрузить историю объекта",
            empty: {
              icon: History,
              title: "Событий по объекту пока нет",
              description:
                "История начнётся с загрузки проектной документации: извлечение позиций, запросы поставщикам, отчёты с площадки и решения появятся здесь автоматически.",
              actionLabel: "Загрузить документацию",
              onAction: () =>
                navigate({ to: "/projects/$id/documents", params: { id: project.id } }),
            },
            filtered: {
              onReset: reset,
              description:
                "Нет событий этого типа от выбранного автора. Сбросьте фильтры, чтобы увидеть всю историю.",
            },
          }}
        >
          <ol className="px-4 py-4 md:px-6">
            {days.map(([day, list]) => (
              <li key={day} className="mb-5 last:mb-0">
                <h3 className="sticky top-0 z-[1] -mx-4 mb-2 bg-surface/95 px-4 py-1.5 text-[12px] font-semibold text-text-secondary backdrop-blur md:-mx-6 md:px-6">
                  {fmtDayTitle(day)}
                </h3>
                <ol className="relative">
                  {list.map((event, index) => {
                    const style = typeStyle[event.type];
                    const person = employeeById(event.actorId);
                    return (
                      <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < list.length - 1 && (
                          <span
                            className="absolute top-10 bottom-0 left-[19px] w-px bg-border"
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            "relative z-[1] grid size-10 shrink-0 place-items-center rounded-full",
                            style.tone,
                          )}
                          title={timelineTypeLabel[event.type]}
                        >
                          <style.icon className="size-4" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[14px] leading-snug font-medium">{event.title}</p>
                            <SourceRef
                              sourceId={event.sourceId}
                              onOpen={() => event.sourceId && setSource(event.sourceId)}
                              className="-mt-2 -mr-2 lg:mt-0 lg:mr-0"
                            />
                          </div>
                          {event.details && (
                            <p className="mt-0.5 text-[13px] text-text-secondary">
                              {event.details}
                            </p>
                          )}
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
                            <span className="inline-flex items-center gap-1">
                              {!person && <Bot className="size-3" />}
                              {person?.name ?? "Автоматическая обработка"}
                            </span>
                            <span className="tnum">{fmtTime(event.at)}</span>
                            <span>· {timelineTypeLabel[event.type]}</span>
                          </p>
                          {event.link && (
                            <Link
                              to={event.link.to}
                              className="mt-1.5 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-accent hover:underline lg:min-h-0"
                            >
                              {event.link.label} <ArrowRight className="size-3.5" />
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </ScreenGate>
      </section>

      {source && <SourceDrawer sourceId={source} onOpenChange={() => setSource(null)} />}
    </>
  );
}

const decisionKind = {
  supplier: "Выбор поставщика",
  replacement: "Замена материала",
  quantity: "Изменение количества",
} as const;

function DecisionCard({
  decision,
  onSource,
}: {
  decision: ProjectDecision;
  onSource: (id: string) => void;
}) {
  const rows: { label: string; content: React.ReactNode }[] = [
    { label: "Что требовалось по проекту", content: decision.requirement },
    { label: "Какая возникла проблема", content: decision.problem },
    {
      label: "Какие варианты рассматривали",
      content: (
        <ul className="list-disc space-y-0.5 pl-4">
          {decision.options.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      ),
    },
    {
      label: "Что выбрали и почему",
      content: (
        <>
          <b className="font-semibold text-text-primary">{decision.choice}.</b> {decision.reason}
        </>
      ),
    },
    {
      label: "Кто согласовал и когда",
      content: `${employeeName(decision.approvedBy)}, ${fmtDateTime(decision.approvedAt)}`,
    },
    {
      label: "На основании какого документа",
      content: (
        <span className="inline-flex items-center gap-1">
          {decision.basis.label}
          {decision.basis.sourceId && (
            <SourceRef
              sourceId={decision.basis.sourceId}
              onOpen={() => onSource(decision.basis.sourceId!)}
            />
          )}
        </span>
      ),
    },
  ];

  return (
    <article className="card-surface overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[.04em] text-ok uppercase">
            {decisionKind[decision.kind]}
          </p>
          <h3 className="mt-0.5 text-[14px] leading-snug font-semibold">{decision.title}</h3>
        </div>
        {decision.link && (
          <Link
            to={decision.link.to}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-caption font-medium text-accent hover:underline lg:min-h-0"
          >
            {decision.link.label} <ArrowRight className="size-3" />
          </Link>
        )}
      </header>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-1 px-4 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3"
          >
            <dt className="text-caption text-text-muted">{row.label}</dt>
            <dd className="text-[13px] text-text-secondary">{row.content}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
