import { useRef, useState, type DragEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  loadProject,
  ProjectNotFound,
  withProject,
  type ProjectPageProps,
} from "@/components/project/ProjectNotFound";
import { useScreenState } from "@/lib/screen-state";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import {
  ArrowLeft,
  Boxes,
  Clock,
  FileUp,
  ListChecks,
  ShoppingCart,
  Truck,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { MetricStrip } from "@/components/common/MetricStrip";
import { PageHeader } from "@/components/common/PageHeader";
import { PillTabs } from "@/components/common/PillTabs";
import { PageCaption } from "@/components/layout/PageActions";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SourceDrawer } from "@/components/common/SourceRef";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SummaryTab } from "@/components/project/SummaryTab";
import {
  DecisionsPreview,
  DocumentsPreview,
  HistoryPreview,
  MaterialsPreview,
  ProgressPreview,
  PurchasesPreview,
  TeamPreview,
} from "@/components/project/PreviewTabs";
import { useApp } from "@/lib/app-context";
import { projectStatusMeta } from "@/lib/project-meta";
import { fmtDate, fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { DEMO_UPLOAD_NOTE } from "@/lib/demo-copy";
import { cn } from "@/lib/utils";
import { mainSpecification } from "@/lib/documents";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { useDirectory } from "@/api/directory";
import { useUploadDocument } from "@/api/mutations";
import { prefetch } from "@/api/prefetch";

const tabs = [
  { id: "summary", label: "Сводка" },
  { id: "documents", label: "Документация" },
  { id: "materials", label: "Материалы" },
  { id: "purchases", label: "Закупки" },
  { id: "progress", label: "Ход работ" },
  { id: "decisions", label: "Решения" },
  { id: "history", label: "История" },
  { id: "team", label: "Команда" },
] as const;

type TabId = (typeof tabs)[number]["id"];

/** Цвет статуса объекта текстом в подписи шапки */
const statusText: Record<string, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-text-2",
  accent: "text-text",
};

export const Route = createFileRoute("/projects/$id/")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabId | undefined } => ({
    tab:
      tabs.some((t) => t.id === search["tab"]) && search["tab"] !== "summary"
        ? (search["tab"] as TabId)
        : undefined,
  }),
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
          { title: `${loaderData.project?.name ?? "Объект"} — neeklo FieldOps` },
          {
            name: "description",
            content: `Карточка объекта ${loaderData.project?.code ?? ""}: что требует внимания, документация, материалы и закупки.`,
          },
          {
            property: "og:title",
            content: `${loaderData.project?.name ?? "Объект"} — neeklo FieldOps`,
          },
          { property: "og:type", content: "website" },
        ]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: withProject(ProjectPage),
});

function ProjectPage({ project, overview, contract }: ProjectPageProps): React.JSX.Element {
  const { employeeName } = useDirectory();
  const documents = useQuery(queries.documents(project.id));
  const liveDocuments = (documents.data ?? []).map((item) => item.document);
  const recognizingDocs = liveDocuments.filter(
    (d) => d.status === "recognizing" || d.status === "uploaded",
  );
  const hasDocuments = liveDocuments.length > 0;
  const screen = useScreenState({
    pending: documents.isPending,
    error: documents.isError,
    empty: !hasDocuments && overview.specTotal === 0,
    processing: recognizingDocs.length > 0,
  });
  const blocked = screen === "loading" || screen === "error" || screen === "forbidden";
  const { tab = "summary" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const upload = useUploadDocument();
  const { setProjectId } = useApp();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const status = projectStatusMeta[project.status];
  const latestVersion = mainSpecification(documents.data ?? [])?.document;

  const setTab = (next: string) =>
    navigate({
      search: { tab: next === "summary" ? undefined : (next as TabId) },
      replace: true,
      resetScroll: false,
    });
  const scope = () => setProjectId(project.id);
  const shared = {
    projectId: project.id,
    overview,
    scope,
    onSource: (id: string | null) => id && setSourceId(id),
  };

  const facts = [
    { label: "Регион", value: overview.region },
    { label: "Заказчик", value: project.customer },
    { label: "Договор", value: project.contract },
    { label: "Стадия", value: overview.stage },
    {
      label: "Сроки",
      value: `${fmtDate(project.startDate)} — ${fmtDate(project.endDate)}`,
    },
    { label: "Ответственный", value: employeeName(project.manager) },
  ];

  const figures = [
    { label: "Позиций материалов", value: overview.specTotal },
    {
      label: "Непроверенных",
      value: overview.specUnverified,
      tone: "warn" as const,
      tab: "materials",
    },
    { label: "Закуплено", value: overview.ordered, tab: "purchases" },
    { label: "В пути", value: overview.inTransit, tab: "purchases" },
    {
      label: "Просроченных запросов",
      value: overview.overdueRequests,
      tone: "danger" as const,
      tab: "purchases",
    },
  ];

  const metricTabs: Record<string, TabId> = {
    Непроверенных: "materials",
    Закуплено: "purchases",
    "В пути": "purchases",
    "Просроченных запросов": "purchases",
  };
  const figureIcons: Record<string, LucideIcon> = {
    "Позиций материалов": Boxes,
    Непроверенных: ListChecks,
    Закуплено: ShoppingCart,
    "В пути": Truck,
    "Просроченных запросов": Clock,
  };
  const tabContent: Record<TabId, React.ReactNode> = {
    summary: <SummaryTab {...shared} onTab={setTab} facts={facts} />,
    documents: <DocumentsPreview {...shared} />,
    materials: <MaterialsPreview {...shared} />,
    purchases: <PurchasesPreview {...shared} />,
    progress: <ProgressPreview {...shared} />,
    decisions: <DecisionsPreview {...shared} />,
    history: <HistoryPreview {...shared} />,
    team: <TeamPreview {...shared} />,
  };

  return (
    <>
      {/* Шапка сущности: название — заголовок шапки, код, статус и ревизия — её подпись */}
      <PageHeader
        title={project.name}
        actions={
          <Button variant="accent" onClick={() => setUploadOpen(true)} disabled={blocked}>
            <Upload className="size-4" /> Загрузить документацию
          </Button>
        }
      />
      <PageCaption>
        <span className="mono text-text-2">{project.code}</span>
        <span aria-hidden className="text-text-3">
          ·
        </span>
        <span className={statusText[status.tone]}>{status.label}</span>
        {latestVersion && (
          <>
            <span aria-hidden className="text-text-3">
              ·
            </span>
            <span className="truncate">
              Документация {latestVersion.version} от {fmtDate(latestVersion.uploadedAt)}
            </span>
          </>
        )}
      </PageCaption>
      {/* На телефоне и планшете подписи в шапке нет — код и статус над метриками */}
      <div className="mb-4 flex flex-wrap items-center gap-2 lg:hidden">
        <Link
          to="/projects"
          className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-xs)] text-caption text-text-3 transition-fast hover:text-text"
        >
          <ArrowLeft className="size-3.5" /> Все объекты
        </Link>
        <span className="mono text-caption text-text-2">{project.code}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      <MetricStrip
        className="mb-5"
        items={figures.map((figure) => {
          const tabId = metricTabs[figure.label];
          return {
            icon: figureIcons[figure.label] ?? Boxes,
            label: figure.label,
            value: (
              <span
                className={cn(
                  figure.tone && figure.value > 0 && figure.tone === "danger" && "text-danger",
                  figure.tone && figure.value > 0 && figure.tone === "warn" && "text-warn",
                )}
              >
                {fmtNum(figure.value)}
              </span>
            ),
            ...(tabId ? { onSelect: () => setTab(tabId), selected: tab === tabId } : {}),
          };
        })}
      />

      <PillTabs
        className="mb-5"
        label="Разделы объекта"
        value={tab}
        onChange={(next) => setTab(next)}
        tabs={tabs.map((item) => ({
          value: item.id,
          label: item.label,
          ...(item.id === "materials" && overview.specUnverified > 0
            ? { count: overview.specUnverified }
            : {}),
          ...(item.id === "purchases" && overview.overdueRequests > 0
            ? { count: overview.overdueRequests }
            : {}),
        }))}
      />

      <div data-main-zone role="tabpanel" aria-label={tabs.find((item) => item.id === tab)?.label}>
        {screen === "partial" && (
          <StateBanner tone="warn" className="mb-4" title="Часть данных объекта не загрузилась">
            Отчёты с площадки за 04.09 ещё не пришли из Telegram — цифры хода работ могут быть
            неполными.
          </StateBanner>
        )}
        {screen === "processing" && (
          <StateBanner tone="info" className="mb-4" title="Документация объекта распознаётся">
            {recognizingDocs.length
              ? recognizingDocs.map((d) => `«${d.title}»`).join(", ")
              : "Новая ревизия"}{" "}
            — позиции и расхождения появятся в сводке автоматически.
          </StateBanner>
        )}

        <ScreenGate
          state={screen}
          onRetry={() => void documents.refetch()}
          skeleton={<ScreenSkeleton kind="summary" />}
          copy={{
            section: "Карточка объекта",
            roles: "руководителю проекта, ПТО и генеральному директору",
            errorTitle: "Не удалось загрузить данные объекта",
            empty: {
              icon: FileUp,
              title: "По объекту ещё нет данных",
              description:
                "Загрузите проектную документацию, и система найдёт в ней материалы. Затем подключите прорабов к Telegram-боту — отчёты и сроки появятся в сводке.",
              actionLabel: "Загрузить документацию",
              onAction: () => setUploadOpen(true),
            },
            filtered: {
              title: "В этой вкладке нет записей",
              description: "Переключитесь на «Сводку», чтобы увидеть всё по объекту.",
              onReset: () => setTab("summary"),
            },
          }}
        >
          {tabContent[tab]}
        </ScreenGate>
      </div>

      {!blocked && (
        <MobileActionBar>
          <Button variant="accent" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" /> Загрузить документацию
          </Button>
        </MobileActionBar>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        projectName={project.name}
        nextVersion={
          latestVersion ? `Рев. ${Number(latestVersion.version.replace(/\D/g, "")) + 1}` : "Рев. 1"
        }
        contractNumber={contract?.number ?? project.contract}
        onUpload={(files) => {
          // mutateAsync, а не колбэки mutate: они не срабатывают после ухода с карточки
          files.forEach((file) =>
            upload
              .mutateAsync({
                projectId: project.id,
                fileName: file.name,
                sizeKb: Math.max(1, Math.round(file.size / 1024)),
              })
              .catch(() =>
                toast.error(`Не загружено: ${file.name}`, {
                  description: "Проверьте размер файла (до 500 МБ) и повторите.",
                }),
              ),
          );
          navigate({ to: "/projects/$id/documents", params: { id: project.id } });
        }}
      />
      {sourceId && <SourceDrawer sourceId={sourceId} onOpenChange={() => setSourceId(null)} />}
    </>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  projectName,
  nextVersion,
  contractNumber,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectName: string;
  nextVersion: string;
  contractNumber: string;
  onUpload: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setFiles([]);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    setFiles(Array.from(e.dataTransfer.files));
  }

  function submit() {
    const accepted = files.filter((file) => /\.(pdf|docx|xlsx)$/i.test(file.name));
    close(false);
    if (!accepted.length) {
      toast.error("Файлы не приняты", { description: "Поддерживаются PDF, DOCX и XLSX." });
      return;
    }
    onUpload(accepted);
    toast.success(`Документация принята как ${nextVersion}`, {
      description: DEMO_UPLOAD_NOTE,
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Загрузить документацию</DialogTitle>
          <DialogDescription>
            {projectName} · договор {contractNumber}. Новая версия будет {nextVersion}.
          </DialogDescription>
        </DialogHeader>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "focus-within:ring-2 focus-within:ring-orange-line flex cursor-pointer flex-col items-center justify-center rounded-[var(--r-md)] border border-dashed border-border-strong bg-raised px-6 py-10 text-center transition-fast hover:bg-hover",
            dragging && "border-line-2 bg-surface-2",
          )}
        >
          <FileUp className="size-8 text-text-muted" strokeWidth={1.5} />
          <span className="mt-3 text-[14px] font-medium">
            Перетащите файлы или выберите на диске
          </span>
          <span className="mt-1 text-caption text-text-muted">
            PDF, DOCX, XLSX · разделы АР, КМ, спецификации, узлы
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx"
            className="sr-only"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        {files.length > 0 && (
          <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-[var(--r-md)] border border-border">
            {files.map((file) => (
              <li
                key={file.name}
                className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
              >
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="tnum shrink-0 text-caption text-text-muted">
                  {fmtNum(Math.ceil(file.size / 1024))} КБ
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-caption text-text-muted">
          После загрузки позиции спецификации попадают на проверку, проверенные уходят в запросы
          поставщикам. {DEMO_UPLOAD_NOTE}
        </p>

        <DialogFooter>
          <Button variant="secondary" onClick={() => close(false)}>
            Отмена
          </Button>
          <Button variant="accent" disabled={!files.length} onClick={submit}>
            Загрузить {files.length > 0 && `(${files.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
