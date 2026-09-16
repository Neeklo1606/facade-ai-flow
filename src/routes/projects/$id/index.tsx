import { useRef, useState, type DragEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  loadProject,
  ProjectNotFound,
  withProject,
  type ProjectPageProps,
} from "@/components/project/ProjectNotFound";
import { specActions } from "@/lib/spec-store";
import { useScreenState } from "@/lib/screen-state";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { ArrowLeft, CalendarRange, FileUp, Upload } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SourceDrawer } from "@/components/common/SourceRef";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";
import { mainSpecification } from "@/lib/documents";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { useDirectory } from "@/api/directory";

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

export const Route = createFileRoute("/projects/$id/")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabId | undefined } => ({
    tab:
      tabs.some((t) => t.id === search["tab"]) && search["tab"] !== "summary"
        ? (search["tab"] as TabId)
        : undefined,
  }),
  loader: ({ params, context }) => loadProject(context.queryClient, params.id),
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
    empty: !hasDocuments && overview.specTotal === 0,
    processing: recognizingDocs.length > 0 && project.id !== "p-korona",
  });
  const blocked = screen === "loading" || screen === "error" || screen === "forbidden";
  const { tab = "summary" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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

  return (
    <>
      <Link
        to="/projects"
        className="focus-ring mb-1 inline-flex min-h-11 items-center gap-1.5 lg:mb-3 lg:min-h-0 rounded-[var(--r-xs)] text-caption text-text-muted transition-fast hover:text-text-primary"
      >
        <ArrowLeft className="size-3.5" /> Все объекты
      </Link>

      <section className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono rounded-[var(--r-xs)] bg-subtle px-1.5 py-0.5 text-caption text-text-secondary">
                {project.code}
              </span>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              {latestVersion && (
                <span className="text-caption text-text-muted">
                  Документация {latestVersion.version} от {fmtDate(latestVersion.uploadedAt)}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
              {project.name}
            </h1>
          </div>
          <Button
            variant="accent"
            onClick={() => setUploadOpen(true)}
            className="hidden sm:inline-flex"
            disabled={blocked}
          >
            <Upload className="size-4" /> Загрузить документацию
          </Button>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border px-5 py-3.5 md:grid-cols-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className={cn("min-w-0", fact.label === "Сроки" && "col-span-2 md:col-span-1")}
            >
              <dt className="text-[11px] text-text-muted">{fact.label}</dt>
              <dd className="mt-0.5 text-[13px] font-medium md:truncate" title={fact.value}>
                {fact.label === "Сроки" && (
                  <CalendarRange className="mr-1 mb-0.5 inline size-3.5 text-text-muted" />
                )}
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-2 gap-px border-t border-border bg-border md:grid-cols-5">
          {figures.map((figure, index) => {
            const hot = figure.tone && figure.value > 0;
            const content = (
              <>
                <span className="block truncate text-caption text-text-secondary">
                  {figure.label}
                </span>
                <span
                  className={cn(
                    "tnum mt-1 block text-[26px] leading-none font-semibold tracking-[-0.02em]",
                    hot && figure.tone === "danger" && "text-danger",
                    hot && figure.tone === "warn" && "text-warn",
                    figure.tone && figure.value === 0 && "text-text-muted",
                  )}
                >
                  {fmtNum(figure.value)}
                </span>
              </>
            );
            const cellClass = cn(
              "relative min-w-0 bg-raised px-5 py-3.5 text-left",
              index === figures.length - 1 &&
                figures.length % 2 === 1 &&
                "col-span-2 md:col-span-1",
            );
            return figure.tab ? (
              <button
                key={figure.label}
                type="button"
                onClick={() => setTab(figure.tab!)}
                className={cn(cellClass, "focus-ring transition-fast hover:bg-hover")}
              >
                {hot && (
                  <span
                    className={cn(
                      "absolute inset-y-3.5 left-0 w-[3px] rounded-r-full",
                      figure.tone === "danger" ? "bg-danger" : "bg-warn",
                    )}
                    aria-hidden
                  />
                )}
                {content}
              </button>
            ) : (
              <div key={figure.label} className={cellClass}>
                {content}
              </div>
            );
          })}
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <div className="-mx-4 overflow-x-auto overflow-y-hidden border-b border-border px-4 [scrollbar-width:none] md:mx-0 md:px-0">
          <TabsList className="h-auto gap-1 rounded-none bg-transparent p-0">
            {tabs.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="relative h-11 rounded-none lg:h-10 border-0 bg-transparent px-3 text-[13px] text-text-secondary shadow-none after:absolute after:inset-x-2 after:bottom-[-1px] after:h-[2px] after:rounded-full hover:text-text-primary data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:shadow-none data-[state=active]:after:bg-accent"
              >
                {item.label}
                {item.id === "materials" && overview.specUnverified > 0 && (
                  <span className="tnum ml-1.5 rounded-full bg-warn-bg px-1.5 text-[11px] font-semibold text-warn">
                    {fmtNum(overview.specUnverified)}
                  </span>
                )}
                {item.id === "purchases" && overview.overdueRequests > 0 && (
                  <span className="tnum ml-1.5 rounded-full bg-danger-bg px-1.5 text-[11px] font-semibold text-danger">
                    {overview.overdueRequests}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {screen === "partial" && (
          <StateBanner tone="warn" className="mt-4" title="Часть данных объекта не загрузилась">
            Отчёты с площадки за 04.09 ещё не пришли из Telegram — цифры хода работ могут быть
            неполными.
          </StateBanner>
        )}
        {screen === "processing" && (
          <StateBanner tone="info" className="mt-4" title="Документация объекта распознаётся">
            {recognizingDocs.length
              ? recognizingDocs.map((d) => `«${d.title}»`).join(", ")
              : "Новая ревизия"}{" "}
            — позиции и расхождения появятся в сводке автоматически.
          </StateBanner>
        )}

        <div className="mt-4">
          <ScreenGate
            state={screen}
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
            <TabsContent value="summary">
              <SummaryTab {...shared} onTab={setTab} />
            </TabsContent>
            <TabsContent value="documents">
              <DocumentsPreview {...shared} />
            </TabsContent>
            <TabsContent value="materials">
              <MaterialsPreview {...shared} />
            </TabsContent>
            <TabsContent value="purchases">
              <PurchasesPreview {...shared} />
            </TabsContent>
            <TabsContent value="progress">
              <ProgressPreview {...shared} />
            </TabsContent>
            <TabsContent value="decisions">
              <DecisionsPreview {...shared} />
            </TabsContent>
            <TabsContent value="history">
              <HistoryPreview {...shared} />
            </TabsContent>
            <TabsContent value="team">
              <TeamPreview {...shared} />
            </TabsContent>
          </ScreenGate>
        </div>
      </Tabs>

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
          files.forEach((file) => specActions.upload(project.id, file));
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
      description: "Извлекаем позиции — стадии обработки видны в реестре документации.",
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
            "focus-within:ring-accent flex cursor-pointer flex-col items-center justify-center rounded-[var(--r-md)] border border-dashed border-border-strong bg-raised px-6 py-10 text-center transition-fast hover:bg-hover",
            dragging && "border-accent bg-accent-subtle",
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
          После загрузки позиции спецификации извлекаются автоматически и попадают на проверку.
          Проверенные позиции можно сразу отправить в запросы поставщикам.
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
