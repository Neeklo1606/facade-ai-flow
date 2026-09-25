import { useMemo, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCheck,
  ClipboardCheck,
  FileText,
  HardHat,
  Image as ImageIcon,
  Mic,
  PencilLine,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { MetricStrip } from "@/components/common/MetricStrip";
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
import { useCanWrite } from "@/api/access";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { SourceDrawer, SourceRef } from "@/components/common/SourceRef";
import { StatusBadge, type Tone } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useNow } from "@/api/clock";
import { CreateReportDialog } from "@/components/field/CreateReportDialog";
import { queries } from "@/api/queries";
import { useScreenState } from "@/lib/screen-state";
import { note } from "@/lib/contour-copy";
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

/** Иконки статусов проверки в полосе метрик */
const statusIcon: Record<StatusFilter, LucideIcon> = {
  all: HardHat,
  review: ClipboardCheck,
  returned: Undo2,
  accepted: CheckCheck,
};

function FieldReportsPage({ project, zones }: ProjectPageProps): React.JSX.Element {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const reportsQuery = useQuery(queries.reports(project.id));
  const [source, setSource] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const feed = useRef<HTMLOListElement>(null);

  const reports = useMemo(
    () => (reportsQuery.data ?? []).map((item) => item.report),
    [reportsQuery.data],
  );
  const visible = reports
    .filter((r) => (search.status ? r.status === search.status : true))
    .filter((r) => (search.zone ? r.zoneId === search.zone : true));
  const toReview = reports.filter((r) => r.status === "review");
  const canWriteReports = useCanWrite("field-reports");

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
  const today = now.slice(0, 10);
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
        actions={
          !blocked &&
          canWriteReports && (
            <span className="flex flex-wrap gap-2">
              {/* Пока нет бота, это единственный способ сдать объём (ADR-022) */}
              <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                <HardHat className="size-4" /> Завести отчёт
              </Button>
              {/* Как на телефоне: кнопка есть, когда есть что проверять и право проверять (ADR-015) */}
              {toReview.length > 0 && (
                <Button variant="accent" onClick={nextToReview}>
                  <Check className="size-4" /> К следующему на проверке
                </Button>
              )}
            </span>
          )
        }
      />

      <CreateReportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={project.id}
        zones={zones}
        today={today}
      />

      <p className="sr-only">
        Отчёты прорабов: объём за смену, фото и проблемы. Проверьте объём и примите отчёт или
        верните на уточнение. {note("telegram")}
      </p>

      {/* Ячейка полосы — фильтр ленты по статусу проверки */}
      <MetricStrip
        className="mb-5"
        items={(["all", "review", "returned", "accepted"] as StatusFilter[]).map((id) => {
          const active = (search.status ?? "all") === id;
          return {
            icon: statusIcon[id],
            label: id === "all" ? "Всего отчётов" : statusMeta[id].label,
            value: fmtNum(
              id === "all" ? reports.length : reports.filter((r) => r.status === id).length,
            ),
            selected: active,
            onSelect: () => setSearch({ status: id === "all" ? undefined : id }),
          };
        })}
      />

      <div data-main-zone className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Захватка"
            allLabel="Все захватки"
            value={search.zone}
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            onChange={(zone) => setSearch({ zone })}
          />
        </div>

        {screen === "processing" && (
          <StateBanner tone="info" title="Распознаём новый голосовой отчёт Гареева, 52 с">
            Объём, захватка и проблемы появятся в ленте через минуту.
          </StateBanner>
        )}
        {screen === "partial" && (
          <StateBanner tone="warn" title="Фото из 2 отчётов ещё загружаются из Telegram">
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
              description: `Отчёты приходят от прорабов бригад объекта: объём за смену, фото и проблемы. Проверьте, что бригады и их прорабы заведены. ${note("telegram")}`,
              actionLabel: "Проверить бригады объекта",
              onAction: () =>
                navigate({
                  to: "/projects/$id",
                  params: { id: project.id },
                  search: { tab: "team" },
                }),
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
      </div>

      {!blocked && toReview.length > 0 && canWriteReports && (
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
  const review = useReviewReport({
    onFailed: () => toast.error("Решение по отчёту не сохранилось", { description: "Повторите." }),
  });
  // Принять или вернуть отчёт — запись в отчётах; директор видит отчёты без действий (ADR-012)
  const canWrite = useCanWrite("field-reports");
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
    setEditing(false);
    review.mutate(
      { id: report.id, status: "accepted", acceptedQty: value },
      {
        onSuccess: () =>
          toast.success(`Отчёт принят: ${fmtNum(value)} ${report.unit}`, {
            description: zone?.name ?? "",
          }),
      },
    );
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
              {/* Отчёт, заведённый руками, не притворяется сообщением с площадки (ADR-022, п. 2) */}
              {card?.source?.kind === "manual" && <span>· внесён вручную</span>}
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
              {/* Захватка — ссылка в «Ход работ»: там план, факт и отклонение (ADR-018) */}
              {zone ? (
                <Link
                  to="/projects/$id"
                  params={{ id: report.projectId }}
                  search={{ tab: "progress" }}
                  className="focus-ring inline-flex min-h-11 items-center rounded-[var(--r-xs)] text-caption text-text-muted underline-offset-2 transition-fast is-hover:text-text-2 is-hover:underline lg:min-h-0"
                >
                  {zone.name}
                </Link>
              ) : (
                <p className="text-caption text-text-muted">Захватка не указана</p>
              )}
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
              <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
                Принять
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </form>
          ) : !canWrite ? (
            <p className="text-caption text-text-muted">
              {report.status === "returned" ? "Возвращён на уточнение" : "Ждёт приёмки объёма"}
            </p>
          ) : (
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-1 sm:justify-end [&>button]:px-2 sm:[&>button]:px-3.5">
              <Button
                variant="secondary"
                disabled={!report.declaredQty}
                onClick={() => accept(report.declaredQty)}
                data-tour="report-accept"
              >
                <Check className="size-4" /> Принять
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <PencilLine className="size-4" /> Объём
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  review.mutate(
                    { id: report.id, status: "returned", acceptedQty: null },
                    {
                      onSuccess: () =>
                        toast("Отчёт возвращён на уточнение", {
                          description: "Отчёт останется в ленте со статусом «Возвращён».",
                        }),
                    },
                  );
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
