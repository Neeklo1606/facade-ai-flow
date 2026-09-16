import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  FileText,
  HardHat,
  Image as ImageIcon,
  Mic,
  PencilLine,
  Undo2,
} from "lucide-react";
import {
  loadProject,
  ProjectNotFound,
  withProject,
  type ProjectPageProps,
} from "@/components/project/ProjectNotFound";
import { SubpageHeader } from "@/components/project/SubpageHeader";
import { PhotoGallery, VoiceReport } from "@/components/field/Media";
import { FilterChip } from "@/components/common/FilterBar";
import { FilterSelect } from "@/components/common/FilterSelect";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { SourceDrawer, SourceRef } from "@/components/common/SourceRef";
import { StatusBadge, type Tone } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useNow } from "@/api/clock";
import { queries } from "@/api/queries";
import { useScreenState } from "@/lib/screen-state";
import { fmtDayTitle, fmtNum, fmtTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { type FieldReport, reportKindLabel, reportStatusLabel } from "@/contracts";
import { useDirectory } from "@/api/directory";
import { useReviewReport } from "@/api/mutations";
import { prefetch } from "@/api/prefetch";

type StatusFilter = FieldReport["status"] | "all";

interface ReportsSearch {
  status?: FieldReport["status"] | undefined;
  zone?: string | undefined;
}

export const Route = createFileRoute("/projects/$id/field-reports")({
  validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
    status:
      search["status"] === "review" ||
      search["status"] === "accepted" ||
      search["status"] === "returned"
        ? search["status"]
        : undefined,
    zone: typeof search["zone"] === "string" && search["zone"] ? search["zone"] : undefined,
  }),
  loader: async ({ params, context }) => {
    const [result] = await Promise.all([
      loadProject(context.queryClient, params.id),
      prefetch(context.queryClient, queries.reports(params.id)),
    ]);
    return result;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `Отчёты с площадки — ${loaderData.project?.name ?? "Объект"} — neeklo FieldOps` }]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: withProject(FieldReportsPage),
});

const statusTone: Record<FieldReport["status"], Tone> = {
  review: "warn",
  accepted: "ok",
  returned: "danger",
};

const statusMeta = Object.fromEntries(
  (Object.keys(statusTone) as FieldReport["status"][]).map((status) => [
    status,
    { label: reportStatusLabel[status], tone: statusTone[status] },
  ]),
) as Record<FieldReport["status"], { label: string; tone: Tone }>;

const kindMeta = {
  voice: { label: reportKindLabel.voice, icon: Mic },
  text: { label: reportKindLabel.text, icon: FileText },
  photo: { label: reportKindLabel.photo, icon: ImageIcon },
};

function FieldReportsPage({ project, zones }: ProjectPageProps): React.JSX.Element {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const reportsQuery = useQuery(queries.reports(project.id));
  const [source, setSource] = useState<string | null>(null);
  const feed = useRef<HTMLOListElement>(null);

  const reports = useMemo(
    () => (reportsQuery.data ?? []).map((item) => item.report),
    [reportsQuery.data],
  );
  const visible = reports
    .filter((r) => (search.status ? r.status === search.status : true))
    .filter((r) => (search.zone ? r.zoneId === search.zone : true));
  const toReview = reports.filter((r) => r.status === "review");

  const days = useMemo(() => {
    const map = new Map<string, FieldReport[]>();
    for (const r of visible) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    return [...map.entries()];
  }, [visible]);

  const setSearch = (patch: Partial<ReportsSearch>) =>
    navigate({
      search: (prev: ReportsSearch) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    });

  const now = useNow();
  const screen = useScreenState({
    pending: reportsQuery.isPending,
    error: reportsQuery.isError,
    empty: reports.length === 0,
    filtered: visible.length === 0,
    processing: false,
  });
  const blocked = screen === "loading" || screen === "error" || screen === "forbidden";

  function nextToReview() {
    const target = toReview.find((r) => visible.includes(r)) ?? toReview[0];
    if (!target) return;
    if (!visible.includes(target)) setSearch({ status: undefined, zone: undefined });
    requestAnimationFrame(() =>
      document
        .getElementById(`report-${target.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <>
      <SubpageHeader
        project={project}
        title="Отчёты с площадки"
        description="Отчёты прорабов из Telegram: объём, фото и проблемы. Проверьте объём и примите отчёт или верните на уточнение."
        meta={
          <span className="text-caption text-text-secondary">
            На проверке <b className="tnum font-semibold text-warn">{toReview.length}</b> · всего{" "}
            {reports.length}
          </span>
        }
        actions={
          <Button
            variant="accent"
            className="hidden sm:inline-flex"
            disabled={blocked || toReview.length === 0}
            onClick={nextToReview}
          >
            <Check className="size-4" /> К следующему на проверке
          </Button>
        }
      />

      <div className="mb-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {(["all", "review", "returned", "accepted"] as StatusFilter[]).map((id) => (
            <FilterChip
              key={id}
              className="min-h-11 lg:min-h-9"
              active={(search.status ?? "all") === id}
              onClick={() => setSearch({ status: id === "all" ? undefined : id })}
              count={id === "all" ? reports.length : reports.filter((r) => r.status === id).length}
            >
              {id === "all" ? "Все" : statusMeta[id].label}
            </FilterChip>
          ))}
        </div>
        <div className="sm:ml-auto">
          <FilterSelect
            label="Захватка"
            allLabel="Все захватки"
            value={search.zone}
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            onChange={(zone) => setSearch({ zone })}
          />
        </div>
      </div>

      {screen === "processing" && (
        <StateBanner
          tone="info"
          className="mb-3"
          title="Распознаём новый голосовой отчёт Гареева, 52 с"
        >
          Объём, захватка и проблемы появятся в ленте через минуту.
        </StateBanner>
      )}
      {screen === "partial" && (
        <StateBanner
          tone="warn"
          className="mb-3"
          title="Фото из 2 отчётов ещё загружаются из Telegram"
        >
          Слабая связь на площадке — карточки дополнятся, когда фото дойдут.
        </StateBanner>
      )}

      <ScreenGate
        state={screen}
        onRetry={() => void reportsQuery.refetch()}
        skeleton={<ScreenSkeleton kind="feed" />}
        copy={{
          section: "Отчёты с площадки",
          roles: "руководителю проекта, ПТО и прорабам объекта",
          errorTitle: "Не удалось загрузить отчёты",
          empty: {
            icon: HardHat,
            title: "Отчётов с площадки пока нет",
            description:
              "Прорабы отправляют отчёты в Telegram-бот голосом, текстом или фото. После распознавания отчёт появится здесь с объёмом и проблемами.",
          },
          filtered: {
            onReset: () => setSearch({ status: undefined, zone: undefined }),
            description:
              "Нет отчётов с таким статусом по выбранной захватке. Сбросьте фильтры, чтобы увидеть всю ленту.",
          },
        }}
      >
        <ol ref={feed} className="space-y-5">
          {days.map(([day, list]) => (
            <li key={day}>
              <h2 className="mb-2 text-[12px] font-semibold text-text-secondary">
                {fmtDayTitle(day, now)}
              </h2>
              <ol className="space-y-3">
                {list.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onSource={setSource}
                    partial={screen === "partial"}
                  />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </ScreenGate>

      {!blocked && toReview.length > 0 && (
        <MobileActionBar>
          <Button variant="accent" onClick={nextToReview}>
            <Check className="size-4" /> К следующему на проверке · {toReview.length}
          </Button>
        </MobileActionBar>
      )}

      {source && <SourceDrawer sourceId={source} onOpenChange={() => setSource(null)} />}
    </>
  );
}

function ReportCard({
  report,
  onSource,
  partial,
}: {
  report: FieldReport;
  onSource: (id: string) => void;
  partial: boolean;
}) {
  const { employeeById } = useDirectory();
  const review = useReviewReport();
  const author = employeeById(report.authorId);
  const card = useQuery(queries.reports(report.projectId)).data?.find(
    (item) => item.report.id === report.id,
  );
  const zone = useQuery(queries.project(report.projectId)).data?.zones.find(
    (z) => z.id === report.zoneId,
  );
  const items = card?.evidence ?? [];
  const photos = partial
    ? items.filter((e) => e.kind === "photo").slice(0, 1)
    : items.filter((e) => e.kind === "photo");
  const audio = items.find((e) => e.kind === "audio");
  const fields = card?.extractions ?? [];
  const kind = kindMeta[report.kind];
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(report.acceptedQty ?? report.declaredQty ?? ""));

  const accept = (value: number) => {
    review.mutate({ id: report.id, status: "accepted", acceptedQty: value });
    setEditing(false);
    toast.success(`Отчёт принят: ${fmtNum(value)} ${report.unit}`, {
      description: zone?.name ?? "",
    });
  };

  const end = audio?.location.match(/(\d+):(\d+)$/);
  const duration = end ? Number(end[1]) * 60 + Number(end[2]) : 0;
  const transcript = card?.source?.excerpt ?? "";

  return (
    <li id={`report-${report.id}`} className="scroll-mt-20">
      <article
        className={cn(
          "card-surface overflow-hidden",
          report.status === "review" && "border-l-[3px] border-l-warn",
        )}
      >
        <header className="flex items-start gap-3 px-4 pt-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-pastel-slate text-[13px] font-semibold text-pastel-slate-fg">
            {author?.name
              .split(" ")
              .slice(0, 2)
              .map((p) => p[0])
              .join("")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{author?.name}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-text-muted">
              {author?.position} · <span className="tnum">{fmtTime(report.sentAt)}</span> ·
              <span className="inline-flex items-center gap-1">
                <kind.icon className="size-3" /> {kind.label}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StatusBadge tone={statusMeta[report.status].tone}>
              {statusMeta[report.status].label}
            </StatusBadge>
            <SourceRef
              sourceId={report.sourceId}
              onOpen={() => onSource(report.sourceId)}
              className="-mr-2 lg:mr-0"
            />
          </div>
        </header>

        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="min-w-0">
              <p className="text-caption text-text-muted">{zone?.name}</p>
              <p className="text-[14px] font-medium">{report.workType}</p>
            </div>
            <div className="text-right">
              <p className="text-caption text-text-muted">
                {report.acceptedQty != null ? "Принято" : "Заявлено"}
              </p>
              <p className="tnum text-[24px] leading-none font-semibold">
                {report.declaredQty || report.acceptedQty
                  ? fmtNum(report.acceptedQty ?? report.declaredQty)
                  : "—"}
                <span className="ml-1 text-[13px] font-normal text-text-secondary">
                  {report.unit}
                </span>
              </p>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-text-secondary">{report.summary}</p>

          {audio && fields.length > 0 && (
            <VoiceReport duration={duration} transcript={transcript} fields={fields} />
          )}

          {photos.length > 0 && <PhotoGallery photos={photos} />}
          {partial && items.filter((e) => e.kind === "photo").length > photos.length && (
            <p className="text-caption text-text-muted">
              Ещё {items.filter((e) => e.kind === "photo").length - photos.length} фото загружаются…
            </p>
          )}

          {report.issues.length > 0 && (
            <ul className="space-y-1.5">
              {report.issues.map((issue) => (
                <li
                  key={issue.id}
                  className={cn(
                    "flex gap-2 rounded-[var(--r-sm)] px-3 py-2 text-[13px]",
                    issue.severity === "blocker"
                      ? "bg-danger-bg text-danger"
                      : "bg-warn-bg text-warn",
                  )}
                >
                  {issue.severity === "blocker" ? (
                    <AlertOctagon className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  )}
                  {issue.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {report.status === "accepted" ? (
            <p className="text-caption text-text-muted">
              Принят · {fmtNum(report.acceptedQty ?? 0)} {report.unit} в ходе работ
            </p>
          ) : editing ? (
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = Number(qty.replace(",", "."));
                if (value > 0) accept(value);
              }}
            >
              <Input
                autoFocus
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="tnum h-11 w-28 lg:h-9"
                aria-label={`Принятый объём, ${report.unit}`}
              />
              <span className="text-caption text-text-muted">{report.unit}</span>
              <Button type="submit" variant="accent" className="flex-1 sm:flex-none">
                Принять
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </form>
          ) : (
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-1 sm:justify-end [&>button]:px-2 sm:[&>button]:px-3.5">
              <Button
                variant="accent"
                disabled={!report.declaredQty}
                onClick={() => accept(report.declaredQty)}
              >
                <Check className="size-4" /> Принять
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <PencilLine className="size-4" /> Объём
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  review.mutate({ id: report.id, status: "returned", acceptedQty: null });
                  toast("Отчёт возвращён на уточнение", {
                    description: "Отчёт останется в ленте со статусом «Возвращён».",
                  });
                }}
                disabled={report.status === "returned"}
              >
                <Undo2 className="size-4" /> Вернуть
              </Button>
            </div>
          )}
        </footer>
      </article>
    </li>
  );
}
