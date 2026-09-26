import { useEffect, useRef, useState, type DragEvent } from "react";
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
import { ProgressTab } from "@/components/project/ProgressTab";
import { TeamTab } from "@/components/project/TeamTab";
import {
  DecisionsPreview,
  DocumentsPreview,
  HistoryPreview,
  MaterialsPreview,
  PurchasesPreview,
} from "@/components/project/PreviewTabs";
import { useApp } from "@/lib/app-context";
import { ProjectStatusControl } from "@/components/project/ProjectStatusControl";
import { fmtDate, fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { note } from "@/lib/contour-copy";
import { cn } from "@/lib/utils";
import { mainSpecification } from "@/lib/documents";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { useDirectory } from "@/api/directory";
import { useUploadDocument } from "@/api/mutations";
import { useAccess, type Section } from "@/api/access";
import { prefetch } from "@/api/prefetch";

/** Вкладки карточки и разделы прав, которым они принадлежат (ADR-012) */
const tabs = [
  { id: "summary", label: "Сводка", section: "projects" },
  { id: "documents", label: "Документация", section: "documents" },
  { id: "materials", label: "Материалы", section: "materials" },
  { id: "purchases", label: "Закупки", section: "procurement" },
  { id: "progress", label: "Ход работ", section: "projects" },
  { id: "decisions", label: "Решения", section: "timeline" },
  { id: "history", label: "История", section: "timeline" },
  { id: "team", label: "Команда", section: "projects" },
] as const satisfies readonly { id: string; label: string; section: Section }[];

type TabId = (typeof tabs)[number]["id"];

/** Цвет статуса объекта текстом в подписи шапки */
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
  const { can } = useAccess();
  const canDocuments = can("documents");
  const documents = useQuery({ ...queries.documents(project.id), enabled: canDocuments });
  const liveDocuments = (documents.data ?? []).map((item) => item.document);
  const recognizingDocs = liveDocuments.filter(
    (d) => d.status === "recognizing" || d.status === "uploaded",
  );
  const hasDocuments = liveDocuments.length > 0;
  const { tab: requested = "summary" } = Route.useSearch();
  const visibleTabs = tabs.filter((item) => can(item.section));
  // Вкладка раздела, закрытого роли, по ссылке не открывается — показываем сводку
  const tab: TabId = visibleTabs.some((item) => item.id === requested) ? requested : "summary";
  const screen = useScreenState({
    pending: canDocuments && documents.isPending,
    error: canDocuments && documents.isError,
    /*
     * «По объекту ещё нет данных» — про сводку, а не про весь объект. Пока это стояло на всей
     * карточке, у нового объекта закрывались и «Ход работ», и «Документация»: завести захватку
     * было нельзя, потому что до неё не доходили (ADR-024, ADR-025).
     */
    empty: tab === "summary" && !hasDocuments && overview.specTotal === 0,
    processing: recognizingDocs.length > 0,
  });
  const blocked = screen === "loading" || screen === "error" || screen === "forbidden";
  const navigate = useNavigate({ from: Route.fullPath });
  const upload = useUploadDocument();
  const { setProjectId } = useApp();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

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
    { label: "Позиций материалов", value: overview.specTotal, section: "materials" as const },
    {
      label: "Непроверенных",
      value: overview.specUnverified,
      tone: "warn" as const,
      tab: "materials",
      section: "materials" as const,
    },
    {
      label: "Закуплено",
      value: overview.ordered,
      tab: "purchases",
      section: "procurement" as const,
    },
    {
      label: "В пути",
      value: overview.inTransit,
      tab: "purchases",
      section: "procurement" as const,
    },
    {
      label: "Просроченных запросов",
      value: overview.overdueRequests,
      tone: "danger" as const,
      tab: "purchases",
      section: "procurement" as const,
    },
    // Цифры закрытых роли разделов не показываются (ADR-012)
  ].filter((figure) => can(figure.section) || (figure.section === "materials" && canDocuments));

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
    progress: <ProgressTab project={project} onSource={setSourceId} />,
    decisions: <DecisionsPreview {...shared} />,
    history: <HistoryPreview {...shared} />,
    team: <TeamTab project={project} />,
  };

  return (
    <>
      {/* Шапка сущности: название — заголовок шапки, код, статус и ревизия — её подпись */}
      <PageHeader
        title={project.name}
        actions={
          can("documents", "write") && (
            <Button variant="accent" onClick={() => setUploadOpen(true)} disabled={blocked}>
              <Upload className="size-4" /> Загрузить документацию
            </Button>
          )
        }
      />
      <PageCaption>
        <span className="mono text-text-2">{project.code}</span>
        <span aria-hidden className="text-text-3">
          ·
        </span>
        <ProjectStatusControl project={project} variant="caption" />
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
        <ProjectStatusControl project={project} variant="badge" />
      </div>

      <MetricStrip
        className="mb-5"
        items={figures.map((figure) => {
          const mapped = metricTabs[figure.label];
          const tabId = visibleTabs.some((item) => item.id === mapped) ? mapped : undefined;
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
        tabs={visibleTabs.map((item) => ({
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
              description: note("projectEmpty"),
              ...(can("documents", "write") && {
                actionLabel: "Загрузить документацию",
                onAction: () => setUploadOpen(true),
              }),
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

      {!blocked && can("documents", "write") && (
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
        spec={
          latestVersion
            ? {
                documentId: latestVersion.documentId,
                title: latestVersion.title,
                nextVersion: `Рев. ${latestVersion.revision + 1}`,
              }
            : null
        }
        contractNumber={contract?.number ?? project.contract}
        onUpload={(files, documentId) => {
          // mutateAsync, а не колбэки mutate: они не срабатывают после ухода с карточки.
          // Сообщение об успехе — после ответа, с ревизией, которую действительно создал сервер
          files.forEach((file) =>
            upload
              .mutateAsync({
                projectId: project.id,
                documentId,
                fileName: file.name,
                sizeKb: Math.max(1, Math.round(file.size / 1024)),
              })
              .then((doc) =>
                toast.success(`«${doc.title}» принят как ${doc.version}`, {
                  description: note("upload"),
                }),
              )
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
  spec,
  contractNumber,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectName: string;
  /** Главная спецификация объекта: её новую ревизию карточка и предлагает загрузить */
  spec: { documentId: string; title: string; nextVersion: string } | null;
  contractNumber: string;
  onUpload: (files: File[], documentId: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  // Что загружаем: новую ревизию спецификации (одним файлом) или новые документы
  const [target, setTarget] = useState<"revision" | "new">(spec ? "revision" : "new");
  const revision = target === "revision" && spec !== null;
  // Спецификация может догрузиться после монтирования: режим выбирается при каждом открытии
  const hasSpec = spec !== null;
  useEffect(() => {
    if (open) setTarget(hasSpec ? "revision" : "new");
  }, [open, hasSpec]);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setFiles([]);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const list = Array.from(e.dataTransfer.files);
    setFiles(revision ? list.slice(0, 1) : list);
  }

  function submit() {
    const accepted = files.filter((file) => /\.(pdf|docx|xlsx)$/i.test(file.name));
    close(false);
    if (!accepted.length) {
      toast.error("Файлы не приняты", { description: "Поддерживаются PDF, DOCX и XLSX." });
      return;
    }
    // Ревизия — это один файл; остальные файлы в этом режиме не выбираются (input без multiple)
    onUpload(revision ? accepted.slice(0, 1) : accepted, revision ? spec.documentId : null);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Загрузить документацию</DialogTitle>
          <DialogDescription>
            {projectName} · договор {contractNumber}.{" "}
            {revision
              ? `Файл станет ${spec.nextVersion} документа «${spec.title}».`
              : "Каждый файл станет новым документом, Рев. 1."}
          </DialogDescription>
        </DialogHeader>

        {spec && (
          <div role="radiogroup" aria-label="Что загружаем" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["revision", `Новая ревизия спецификации`, `${spec.nextVersion} · «${spec.title}»`],
                ["new", "Новый документ", "Отдельный документ, Рев. 1"],
              ] as const
            ).map(([value, title, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={target === value}
                onClick={() => {
                  setTarget(value);
                  if (value === "revision") setFiles((list) => list.slice(0, 1));
                }}
                className={cn(
                  "focus-ring min-h-11 rounded-[var(--r-md)] border px-3 py-2 text-left transition-fast",
                  target === value
                    ? "border-line-2 bg-surface-3"
                    : "border-line bg-surface-2 hover:border-line-2",
                )}
              >
                <span className="block text-[13px] font-medium text-text">{title}</span>
                <span className="block truncate text-caption text-text-muted">{hint}</span>
              </button>
            ))}
          </div>
        )}

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
            {revision
              ? "Перетащите файл или выберите на диске"
              : "Перетащите файлы или выберите на диске"}
          </span>
          <span className="mt-1 text-caption text-text-muted">
            PDF, DOCX, XLSX · разделы АР, КМ, спецификации, узлы
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple={!revision}
            accept=".pdf,.docx,.xlsx"
            className="sr-only"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              setFiles(revision ? list.slice(0, 1) : list);
            }}
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
          поставщикам. {note("upload")}
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
