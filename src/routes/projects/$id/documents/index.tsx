import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  FileCheck2,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FileType2,
  Upload,
} from "lucide-react";
import { MetricStrip } from "@/components/common/MetricStrip";
import { SubpageHeader } from "@/components/project/SubpageHeader";
import {
  loadProject,
  ProjectNotFound,
  withProject,
  type ProjectPageProps,
} from "@/components/project/ProjectNotFound";
import { UploadZone, type UploadZoneHandle } from "@/components/documents/UploadZone";
import { ProcessingStages } from "@/components/documents/ProcessingStages";
import { FilterChip } from "@/components/common/FilterBar";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { useScreenState } from "@/lib/screen-state";
import { StatusBadge } from "@/components/common/StatusBadge";
import { docStatusTone } from "@/lib/project-meta";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtNum, plural } from "@/lib/format";
import { toast } from "@/lib/toast";
import { DEMO_UPLOAD_NOTE } from "@/lib/demo-copy";
import { cn } from "@/lib/utils";
import {
  type DocProcessingStatus,
  type ProjectDocument,
  processingStages,
  processingStatusLabel,
  processingStatusLabel as docStatusLabel,
} from "@/contracts";
import { useDirectory } from "@/api/directory";
import { useUploadDocument } from "@/api/mutations";
import { useExtractionJobsWatch } from "@/api/extraction";
import { prefetch } from "@/api/prefetch";

export const Route = createFileRoute("/projects/$id/documents/")({
  loader: async ({ params, context }) => {
    const [result] = await Promise.all([
      loadProject(context.queryClient, params.id),
      prefetch(context.queryClient, queries.documents(params.id)),
    ]);
    return result;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `Документация — ${loaderData.project?.name ?? "Объект"} — neeklo FieldOps` },
          {
            name: "description",
            content:
              "Реестр проектной документации объекта: загрузка, распознавание и извлечение позиций.",
          },
        ]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: withProject(DocumentsPage),
});

const fileIcon = { pdf: FileText, docx: FileType2, xlsx: FileSpreadsheet };

const filters: { id: "all" | DocProcessingStatus; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "review", label: processingStatusLabel.review },
  { id: "recognizing", label: "Распознаются" },
  { id: "verified", label: "Проверенные" },
];

function DocumentsPage({ project }: ProjectPageProps): React.JSX.Element {
  const { employeeName } = useDirectory();
  const navigate = useNavigate();
  const upload = useUploadDocument();
  const zone = useRef<UploadZoneHandle>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");

  // Экран показывает действующие ревизии; прошлые — в карточке объекта, «Ревизии спецификации»
  const query = useQuery(queries.documents(project.id));
  const items = useMemo(() => query.data ?? [], [query.data]);
  useExtractionJobsWatch(items.map((item) => item.job));
  const documents = useMemo(() => items.map((item) => item.document), [items]);
  const stats = useMemo(() => new Map(items.map((item) => [item.document.id, item])), [items]);
  const uploads = useMemo(
    () =>
      Object.fromEntries(
        items.flatMap((item) =>
          item.stage === null ? [] : [[item.document.id, { stage: item.stage }]],
        ),
      ) as Record<string, { stage: number }>,
    [items],
  );

  const inProgress = documents.filter((doc) => uploads[doc.id] && uploads[doc.id]!.stage < 4);
  const justFinished = documents.filter((doc) => uploads[doc.id]?.stage === 4);
  const rows = documents.filter((doc) =>
    filter === "all"
      ? true
      : filter === "recognizing"
        ? doc.status === "recognizing" || doc.status === "uploaded"
        : doc.status === filter,
  );

  async function handleFiles(files: File[]) {
    const results = await Promise.allSettled(
      files.map((file) =>
        upload.mutateAsync({
          projectId: project.id,
          fileName: file.name,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
        }),
      ),
    );
    const loaded = results.filter((result) => result.status === "fulfilled").length;
    if (loaded) {
      toast(`Загружено: ${loaded} ${plural(loaded, "документ", "документа", "документов")}`, {
        description: DEMO_UPLOAD_NOTE,
      });
    }
    if (loaded < files.length) {
      toast.error(`Не загружено: ${files.length - loaded}`, {
        description: "Проверьте размер файла (до 500 МБ) и повторите.",
      });
    }
  }

  const open = (doc: ProjectDocument) =>
    navigate({ to: "/projects/$id/documents/$docId", params: { id: project.id, docId: doc.id } });

  const recognizing = documents.filter((doc) => doc.status === "recognizing" && !uploads[doc.id]);
  const queued = documents.filter((doc) => doc.status === "uploaded" && !uploads[doc.id]);
  const screen = useScreenState({
    pending: query.isPending,
    error: query.isError,
    empty: documents.length === 0,
    filtered: rows.length === 0,
    processing: inProgress.length > 0 || recognizing.length > 0,
    partial: queued.length > 0,
  });
  const blocked = screen === "loading" || screen === "error" || screen === "forbidden";

  const totals = documents.reduce(
    (acc, doc) => {
      const s = stats.get(doc.id);
      return {
        extracted: acc.extracted + (s?.extracted ?? 0),
        verified: acc.verified + (s?.verified ?? 0),
      };
    },
    { extracted: 0, verified: 0 },
  );

  return (
    <>
      <SubpageHeader
        project={project}
        title="Документация"
        actions={
          <Button variant="accent" onClick={() => zone.current?.open()} disabled={blocked}>
            <Upload className="size-4" /> Загрузить документ
          </Button>
        }
      />
      <p className="sr-only">
        Загруженные документы, их обработка и извлечённые позиции. Клик по документу открывает
        проверку.
      </p>

      <MetricStrip
        className="mb-6"
        items={[
          { icon: FileText, label: "Документов", value: fmtNum(documents.length) },
          { icon: FileSearch, label: "Извлечено позиций", value: fmtNum(totals.extracted) },
          { icon: FileCheck2, label: "Проверено", value: fmtNum(totals.verified) },
        ]}
      />

      <div data-main-zone className="space-y-4">
        {!blocked && (
          <UploadZone
            ref={zone}
            onFiles={handleFiles}
            className={screen === "empty" ? "py-10" : ""}
          />
        )}

        {screen === "processing" && recognizing.length > 0 && (
          <StateBanner
            tone="info"

            title={`Распознаётся: ${recognizing.map((d) => `«${d.title}»`).join(", ")}`}
          >
            Обработка идёт на сервере: позиции появятся в реестре и на экране проверки, страницу
            можно закрыть. {DEMO_UPLOAD_NOTE}
          </StateBanner>
        )}
        {screen === "processing" && recognizing.length === 0 && inProgress.length === 0 && (
          <StateBanner tone="info" title="Распознаём загруженные документы">
            Стадии обработки видны в строке каждого документа.
          </StateBanner>
        )}
        {screen === "partial" && (
          <StateBanner
            tone="warn"

            title={`${queued.length} ${queued.length === 1 ? "документ ждёт" : "документа ждут"} очереди на распознавание`}
          >
            {queued.map((d) => d.title).join(", ")}. Остальные документы можно проверять уже сейчас.
          </StateBanner>
        )}

        {(inProgress.length > 0 || justFinished.length > 0) && (
          <section className="card-surface divide-y divide-border" aria-live="polite">
            {[...inProgress, ...justFinished].map((doc) => {
              const stage = uploads[doc.id]!.stage;
              const Icon = fileIcon[doc.fileType];
              return (
                <div
                  key={doc.id}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Icon className="size-4 shrink-0 text-text-muted" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{doc.fileName}</p>
                      <p className="text-caption text-text-muted">{fmtNum(doc.sizeKb)} КБ</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <ProcessingStages stage={stage} compact />
                  </div>
                  {stage === 4 ? (
                    <Button size="sm" variant="secondary" onClick={() => open(doc)}>
                      Проверить {fmtNum(stats.get(doc.id)?.extracted ?? 0)} поз.{" "}
                      <ArrowRight className="size-3.5" />
                    </Button>
                  ) : (
                    <span className="text-caption text-text-muted md:w-[140px] md:text-right">
                      Обрабатывается…
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <section className="card-surface overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            {filters.map((item) => (
              <FilterChip
                key={item.id}
                active={filter === item.id}
                onClick={() => setFilter(item.id)}
                count={
                  item.id === "all"
                    ? documents.length
                    : documents.filter((doc) =>
                        item.id === "recognizing"
                          ? doc.status === "recognizing" || doc.status === "uploaded"
                          : doc.status === item.id,
                      ).length
                }
              >
                {item.label}
              </FilterChip>
            ))}
          </div>

          <ScreenGate
            state={screen}
            onRetry={() => void query.refetch()}
            skeleton={<ScreenSkeleton kind="table" />}
            copy={{
              section: "Документация",
              roles: "руководителю проекта, ПТО и проектировщикам",
              errorTitle: "Не удалось загрузить документацию",
              empty: {
                icon: FileText,
                title: "Документации пока нет",
                description: `Загрузите проектную документацию — позиции появятся здесь и уйдут на проверку. ${DEMO_UPLOAD_NOTE}`,
                actionLabel: "Загрузить документ",
                onAction: () => zone.current?.open(),
              },
              filtered: {
                title: "Документов с таким статусом нет",
                description: "Смените статус или посмотрите все документы объекта.",
                onReset: () => setFilter("all"),
              },
            }}
          >
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1040px] text-table">
                  <thead>
                    <tr className="h-10 bg-subtle text-left text-[11px] font-medium text-text-muted">
                      <th className="px-4">Название</th>
                      <th className="px-2.5">Раздел</th>
                      <th className="px-2.5">Версия</th>
                      <th className="px-2.5">Загружен</th>
                      <th className="px-2.5">Кто загрузил</th>
                      <th className="px-2.5 text-right">Листов</th>
                      <th className="px-2.5 text-right">Извлечено</th>
                      <th className="px-2.5 text-right">Проверено</th>
                      <th className="px-4">Состояние</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((doc) => {
                      const s = stats.get(doc.id);
                      const Icon = fileIcon[doc.fileType];
                      const live = uploads[doc.id];
                      const busy = doc.status === "uploaded" || doc.status === "recognizing";
                      return (
                        <tr
                          key={doc.id}
                          tabIndex={0}
                          onClick={() => open(doc)}
                          onKeyDown={(e) => e.key === "Enter" && open(doc)}
                          className="group h-[60px] cursor-pointer border-b border-border transition-fast last:border-0 hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Icon className="size-4 shrink-0 text-text-muted" strokeWidth={1.5} />
                              <div className="min-w-0">
                                <div className="max-w-[360px] truncate font-medium text-text-primary group-hover:text-text">
                                  {doc.title}
                                </div>
                                <div className="max-w-[360px] truncate text-caption text-text-muted">
                                  {doc.fileName}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2.5">
                            <span className="mono rounded-[var(--r-xs)] bg-subtle px-1.5 py-0.5 text-caption text-text-secondary">
                              {doc.section}
                            </span>
                          </td>
                          <td className="px-2.5 whitespace-nowrap text-text-secondary">
                            {doc.version}
                          </td>
                          <td className="tnum px-2.5 whitespace-nowrap text-text-secondary">
                            {fmtDateTime(doc.uploadedAt)}
                          </td>
                          <td className="px-2.5 whitespace-nowrap text-text-secondary">
                            {employeeName(doc.uploadedBy)}
                          </td>
                          <td className="tnum px-2.5 text-right text-text-secondary">
                            {doc.sheetCount}
                          </td>
                          <td className="tnum px-2.5 text-right text-text-primary">
                            {busy ? (
                              <span className="text-text-muted">—</span>
                            ) : s?.extracted ? (
                              fmtNum(s.extracted)
                            ) : (
                              // Обработка прошла, таблиц спецификации в документе нет:
                              // прочерк читался как незавершённая обработка (TASK-A2, п. 3)
                              <span className="text-caption text-text-muted">без таблиц</span>
                            )}
                          </td>
                          <td className="px-2.5 text-right">
                            {busy || !s?.extracted ? (
                              <span className="text-text-muted">—</span>
                            ) : (
                              <div className="ml-auto w-[88px]">
                                <div className="tnum text-text-primary">{fmtNum(s.verified)}</div>
                                <div className="mt-1 h-1 overflow-hidden rounded-full bg-subtle">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      s.verified < s.extracted ? "bg-warn" : "bg-ok",
                                    )}
                                    style={{ width: `${(s.verified / s.extracted) * 100}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4">
                            {live && live.stage < 4 ? (
                              <span className="inline-flex items-center gap-1.5 text-caption font-medium text-info">
                                <span
                                  className="pulse-dot size-1.5 rounded-full bg-info"
                                  aria-hidden
                                />
                                {processingStages[live.stage]}
                              </span>
                            ) : (
                              <StatusBadge tone={docStatusTone[doc.status]}>
                                {busy && (
                                  <span
                                    className="pulse-dot size-1.5 rounded-full bg-current"
                                    aria-hidden
                                  />
                                )}
                                {docStatusLabel[doc.status]}
                              </StatusBadge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border lg:hidden">
                {rows.map((doc) => {
                  const s = stats.get(doc.id);
                  const Icon = fileIcon[doc.fileType];
                  return (
                    <li key={doc.id}>
                      <Link
                        to="/projects/$id/documents/$docId"
                        params={{ id: project.id, docId: doc.id }}
                        className="flex items-start gap-3 px-4 py-3 transition-fast hover:bg-hover"
                      >
                        <Icon
                          className="mt-0.5 size-4 shrink-0 text-text-muted"
                          strokeWidth={1.5}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium">{doc.title}</p>
                          <p className="mt-0.5 text-caption text-text-muted">
                            {doc.section} · {doc.version} · {doc.sheetCount} л. ·{" "}
                            {employeeName(doc.uploadedBy)}
                          </p>
                          <p className="mt-1 text-caption text-text-secondary">
                            Извлечено <span className="tnum">{fmtNum(s?.extracted ?? 0)}</span> ·
                            проверено <span className="tnum">{fmtNum(s?.verified ?? 0)}</span>
                          </p>
                        </div>
                        <StatusBadge tone={docStatusTone[doc.status]}>
                          {docStatusLabel[doc.status]}
                        </StatusBadge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          </ScreenGate>
        </section>
      </div>

      {!blocked && (
        <MobileActionBar>
          <Button variant="accent" onClick={() => zone.current?.open()}>
            <Upload className="size-4" /> Загрузить документ
          </Button>
        </MobileActionBar>
      )}
    </>
  );
}
