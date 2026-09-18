import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Clock,
  FileDiff,
  FileSearch,
  FileSpreadsheet,
  LayoutGrid,
  Plus,
  Rows3,
  X,
} from "lucide-react";
import { MetricStrip } from "@/components/common/MetricStrip";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { FilterChip } from "@/components/common/FilterBar";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { useScreenState } from "@/lib/screen-state";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterSelect } from "@/components/common/FilterSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/app-context";
import { sectionHref, sectionLabels, type ProjectSection } from "@/lib/navigation";
import { attentionBar, attentionOf, projectStatusMeta } from "@/lib/project-meta";
import { api } from "@/api/client";
import { registryFileName } from "@/api/export-paths";
import type { ProjectListItem } from "@/api/types";
import { saveFile } from "@/lib/download";
import { useQuery } from "@tanstack/react-query";
import { useNow } from "@/api/clock";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import { fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { type Project, type ProjectOverview, type ProjectStatus } from "@/contracts";
import { useDirectory } from "@/api/directory";
import { useCreateProject } from "@/api/mutations";

interface ProjectsSearch {
  region?: string | undefined;
  manager?: string | undefined;
  status?: ProjectStatus | undefined;
  unverified?: boolean | undefined;
  view?: "table" | "cards" | undefined;
  /** Раздел меню, для которого нужно выбрать объект */
  section?: ProjectSection | undefined;
  /** Фильтр, с которым откроется раздел выбранного объекта (переход с дашборда) */
  sectionStatus?: string | undefined;
}

const sections: ProjectSection[] = [
  "documents",
  "materials",
  "procurement",
  "suppliers",
  "field-reports",
  "timeline",
];

const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);

export const Route = createFileRoute("/projects/")({
  validateSearch: (search: Record<string, unknown>): ProjectsSearch => ({
    region: str(search["region"]),
    manager: str(search["manager"]),
    status: str(search["status"]) as ProjectStatus | undefined,
    unverified: search["unverified"] === true || search["unverified"] === "true" ? true : undefined,
    view: search["view"] === "cards" ? "cards" : undefined,
    section: sections.includes(search["section"] as ProjectSection)
      ? (search["section"] as ProjectSection)
      : undefined,
    sectionStatus: str(search["sectionStatus"]),
  }),
  loader: ({ context }) => prefetch(context.queryClient, queries.projects()),
  head: () => ({
    meta: [
      { title: "Объекты — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Реестр объектов: где непроверенная спецификация, просроченные ответы и неразобранные изменения.",
      },
      { property: "og:title", content: "Объекты — neeklo FieldOps" },
      {
        property: "og:description",
        content: "Реестр объектов: где требуется внимание руководителя.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

interface Row {
  id: string;
  project: Project;
  overview: ProjectOverview;
}

/** Строки таблицы из ответа реестра */
function toRows(items: ProjectListItem[] | undefined): Row[] {
  return (items ?? []).map(({ project, overview }) => ({ id: project.id, project, overview }));
}

/** Число, которое требует реакции, выделяется цветом; ноль гасится. */
function Count({ value, tone }: { value: number; tone?: "danger" | "warn" | undefined }) {
  return (
    <span
      className={cn(
        "tnum",
        value === 0 && "text-text-muted",
        value > 0 && tone === "danger" && "font-semibold text-danger",
        value > 0 && tone === "warn" && "font-semibold text-warn",
      )}
    >
      {value === 0 ? "—" : fmtNum(value)}
    </span>
  );
}

function ProjectsPage() {
  const { employeeName } = useDirectory();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { setProjectId } = useApp();
  // Все объекты — для списков фильтров и пустого состояния; строки таблицы фильтрует сервер
  const registry = useQuery(queries.projects());
  const filter = {
    ...(search.region ? { region: search.region } : {}),
    ...(search.manager ? { managerId: search.manager } : {}),
    ...(search.status ? { status: search.status } : {}),
    ...(search.unverified ? { unverified: true } : {}),
  };
  const filtered = useQuery(queries.projects(filter));
  const allRows = useMemo<Row[]>(() => toRows(registry.data), [registry.data]);
  const rows = useMemo<Row[]>(() => toRows(filtered.data), [filtered.data]);
  const regions = [...new Set(allRows.map((row) => row.overview.region))];
  const managers = [...new Set(allRows.map((row) => row.project.manager))];
  const statuses = [...new Set(allRows.map((row) => row.project.status))];
  const view = search.view ?? "table";

  const setSearch = (patch: Partial<ProjectsSearch>) =>
    navigate({ search: (prev: ProjectsSearch) => ({ ...prev, ...patch }), replace: true });

  const screen = useScreenState({
    pending: registry.isPending || filtered.isPending,
    error: registry.isError || filtered.isError,
    empty: allRows.length === 0,
    filtered: rows.length === 0,
  });
  const filtersActive = Boolean(
    search.region || search.manager || search.status || search.unverified,
  );
  const totals = useMemo(
    () => ({
      attention: rows.filter((row) => attentionOf(row.overview)).length,
      unverified: rows.reduce((acc, row) => acc + row.overview.specUnverified, 0),
      overdue: rows.reduce((acc, row) => acc + row.overview.overdueRequests, 0),
      changes: rows.reduce((acc, row) => acc + row.overview.openChanges, 0),
    }),
    [rows],
  );

  /** Пришли из меню раздела без выбранного объекта — открываем сразу этот раздел объекта. */
  const open = (row: Row) => {
    if (!search.section) {
      void navigate({ to: "/projects/$id", params: { id: row.id } });
      return;
    }
    setProjectId(row.id);
    const href = sectionHref(row.id, search.section, undefined, search.sectionStatus);
    void navigate({ to: href.to, search: href.search as never });
  };

  /** Файл строит сервер по тому же фильтру, что у таблицы: не из данных, загруженных во вкладку */
  async function handleExport() {
    setExporting(true);
    try {
      saveFile(await api.projects.exportRegistry(filter), registryFileName());
      toast.success("Реестр выгружен", { description: `${rows.length} объектов в файле Excel` });
    } catch {
      toast.error("Не удалось сформировать файл Excel");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {search.section && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border border-line-2 bg-surface px-4 py-3"
        >
          <ArrowRight className="size-4 shrink-0 text-info" />
          <p className="min-w-0 flex-1 text-[13px]">
            <b className="font-semibold">{sectionLabels[search.section]}</b> ведётся по объекту.
            Выберите объект — раздел откроется сразу.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSearch({ section: undefined, sectionStatus: undefined })}
          >
            <X className="size-3.5" /> Просто открыть реестр
          </Button>
        </div>
      )}

      <PageHeader
        title="Объекты"
        actions={
          <Button variant="accent" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Добавить объект
          </Button>
        }
      />
      <p className="sr-only">
        Где требуется внимание: непроверенная спецификация, просроченные ответы поставщиков и
        неразобранные изменения документации.
      </p>

      <MetricStrip
        className="mb-6"
        items={[
          { icon: Building2, label: "Объектов", value: fmtNum(rows.length) },
          {
            icon: AlertTriangle,
            label: "Требуют внимания",
            value: `${totals.attention} из ${rows.length}`,
          },
          { icon: FileSearch, label: "Непроверенных строк", value: fmtNum(totals.unverified) },
          { icon: Clock, label: "Просроченных ответов", value: fmtNum(totals.overdue) },
          { icon: FileDiff, label: "Открытых изменений", value: fmtNum(totals.changes) },
        ]}
      />

      <div data-main-zone className="space-y-4">
        {screen === "partial" && (
          <StateBanner tone="warn" title="Сводка ТЦ «Галактика» не обновилась">
            Показаны цифры на 05.09, 08:00 — нет связи с почтовым ящиком объекта. Остальные объекты
            актуальны.
          </StateBanner>
        )}
        {screen === "processing" && (
          <StateBanner
            tone="info"

            title="Пересчитываем сводку после загрузки документации"
          >
            Число позиций и непроверенных строк обновится через минуту.
          </StateBanner>
        )}

        <Panel bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
              <FilterSelect
                label="Регион"
                allLabel="Все регионы"
                value={search.region}
                options={regions.map((region) => ({ value: region, label: region }))}
                onChange={(region) => setSearch({ region })}
              />
              <FilterSelect
                label="Ответственный"
                allLabel="Все ответственные"
                value={search.manager}
                options={managers.map((id) => ({ value: id, label: employeeName(id) }))}
                onChange={(manager) => setSearch({ manager })}
              />
              <FilterSelect
                label="Статус"
                allLabel="Все статусы"
                value={search.status}
                options={statuses.map((status) => ({
                  value: status,
                  label: projectStatusMeta[status].label,
                }))}
                onChange={(status) => setSearch({ status: status as ProjectStatus | undefined })}
              />
              <FilterChip
                className="col-span-2 w-full justify-center sm:w-auto"
                active={Boolean(search.unverified)}
                onClick={() => void setSearch({ unverified: search.unverified ? undefined : true })}
              >
                Есть непроверенные позиции
              </FilterChip>
              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSearch({
                      region: undefined,
                      manager: undefined,
                      status: undefined,
                      unverified: undefined,
                    })
                  }
                >
                  Сбросить
                </Button>
              )}
            </div>
            <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
              <span className="mr-auto text-caption text-text-muted sm:mr-0">
                Объектов: {rows.length}
              </span>
              <div
                className="segmented-control hidden lg:flex"
                role="group"
                aria-label="Вид реестра"
              >
                <button
                  type="button"
                  aria-pressed={view === "table"}
                  onClick={() => setSearch({ view: undefined })}
                  className={cn(
                    "segment flex items-center gap-1.5",
                    view === "table" && "segment-active",
                  )}
                >
                  <Rows3 className="size-3.5" /> Таблица
                </button>
                <button
                  type="button"
                  aria-pressed={view === "cards"}
                  onClick={() => setSearch({ view: "cards" })}
                  className={cn(
                    "segment flex items-center gap-1.5",
                    view === "cards" && "segment-active",
                  )}
                >
                  <LayoutGrid className="size-3.5" /> Карточки
                </button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                loading={exporting}
                disabled={!rows.length}
              >
                {!exporting && <FileSpreadsheet className="size-4" />} Excel
              </Button>
            </div>
          </div>
          <ScreenGate
            state={screen}
            onRetry={() => void Promise.all([registry.refetch(), filtered.refetch()])}
            skeleton={<ScreenSkeleton kind="cards" rows={6} />}
            copy={{
              section: "Объекты",
              roles: "руководителям проектов и генеральному директору",
              errorTitle: "Не удалось загрузить объекты",
              empty: {
                icon: Building2,
                title: "Объектов пока нет",
                description:
                  "Добавьте первый объект, затем загрузите договор и проектную документацию — система найдёт в них сроки и материалы.",
                actionLabel: "Добавить объект",
                onAction: () => setCreateOpen(true),
              },
              filtered: {
                title: "Объектов по условиям нет",
                description:
                  "Под выбранные регион, ответственного и статус не попал ни один объект.",
                onReset: () =>
                  setSearch({
                    region: undefined,
                    manager: undefined,
                    status: undefined,
                    unverified: undefined,
                  }),
              },
            }}
          >
            <>
              <div className={cn("hidden overflow-x-auto", view === "table" && "lg:block")}>
                <ProjectsTable rows={rows} onOpen={open} />
              </div>
              <div
                className={cn(
                  "grid gap-3 p-3 sm:grid-cols-2 lg:p-4 2xl:grid-cols-3",
                  view === "table" && "lg:hidden",
                )}
              >
                {rows.map((row) => (
                  <ProjectCard key={row.id} row={row} onOpen={() => open(row)} />
                ))}
              </div>
            </>
          </ScreenGate>
        </Panel>
      </div>

      {screen !== "forbidden" && screen !== "error" && (
        <MobileActionBar>
          <Button variant="accent" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Добавить объект
          </Button>
        </MobileActionBar>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setProjectId(id);
          void navigate({ to: "/projects/$id", params: { id } });
        }}
      />
    </>
  );
}

const numericHeaders = [
  { label: "Версия", title: "Версия проектной документации" },
  { label: "Позиций", title: "Позиций материалов в спецификации" },
  { label: "Непроверено", title: "Строк спецификации без проверки" },
  { label: "Запросов", title: "Активных запросов поставщикам" },
  { label: "Просрочено", title: "Просроченных ответов поставщиков" },
  { label: "Изменений", title: "Открытых изменений документации" },
];

function ProjectsTable({ rows, onOpen }: { rows: Row[]; onOpen: (row: Row) => void }) {
  const { employeeName } = useDirectory();
  return (
    <table className="w-full min-w-[980px] text-table">
      <thead>
        <tr className="h-10 bg-subtle text-left">
          <th className="w-[3px] p-0" aria-hidden />
          <th className="px-3 text-[11px] font-medium text-text-muted">Объект</th>
          <th className="px-2.5 text-[11px] font-medium text-text-muted">Регион</th>
          <th className="px-2.5 text-[11px] font-medium text-text-muted">Заказчик</th>
          <th className="px-2.5 text-[11px] font-medium text-text-muted">Ответственный</th>
          {numericHeaders.map((header) => (
            <th
              key={header.label}
              title={header.title}
              className="px-2 text-right text-[11px] font-medium whitespace-nowrap text-text-muted"
            >
              {header.label}
            </th>
          ))}
          <th className="px-3 text-[11px] font-medium text-text-muted">Статус</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const attention = attentionOf(row.overview);
          const status = projectStatusMeta[row.project.status];
          return (
            <tr
              key={row.id}
              tabIndex={0}
              onClick={() => onOpen(row)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(row)}
              className="group h-[60px] cursor-pointer border-b border-border transition-fast last:border-0 hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
            >
              <td className="relative w-[3px] p-0">
                {attention && (
                  <span
                    className={cn(
                      "absolute inset-y-2 left-0 w-[3px] rounded-r-full",
                      attentionBar[attention],
                    )}
                    aria-label={
                      attention === "critical"
                        ? "Просрочены ответы поставщиков"
                        : "Есть непроверенные позиции"
                    }
                  />
                )}
              </td>
              <td className="px-3 py-2.5">
                <div className="max-w-[190px] truncate font-medium text-text-primary group-hover:text-text">
                  {row.project.name}
                </div>
                <div className="mt-0.5 text-caption text-text-muted">
                  <span className="mono">{row.project.code}</span> · {row.project.contract}
                </div>
              </td>
              <td className="px-2.5 text-text-secondary">{row.overview.region}</td>
              <td className="px-2.5 text-text-secondary">
                <div className="max-w-[130px] truncate">{row.project.customer}</div>
              </td>
              <td className="px-2.5 whitespace-nowrap text-text-secondary">
                {employeeName(row.project.manager)}
              </td>
              <td className="px-2 text-right whitespace-nowrap text-text-secondary">
                {row.overview.docVersion}
              </td>
              <td className="px-2 text-right text-text-primary">
                <Count value={row.overview.specTotal} />
              </td>
              <td className="px-2 text-right">
                <Count value={row.overview.specUnverified} tone="warn" />
              </td>
              <td className="px-2 text-right text-text-secondary">
                <Count value={row.overview.activeRequests} />
              </td>
              <td className="px-2 text-right">
                <Count value={row.overview.overdueRequests} tone="danger" />
              </td>
              <td className="px-2 text-right text-text-secondary">
                <Count value={row.overview.openChanges} />
              </td>
              <td className="px-3">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ProjectCard({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { employeeName } = useDirectory();
  const attention = attentionOf(row.overview);
  const status = projectStatusMeta[row.project.status];
  const { overview } = row;
  const verifiedPct = overview.specTotal
    ? Math.round(((overview.specTotal - overview.specUnverified) / overview.specTotal) * 100)
    : 100;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-surface focus-ring relative w-full overflow-hidden p-4 text-left transition-fast hover:border-border-strong hover:shadow-[var(--shadow-sm)]"
    >
      {attention && (
        <span
          className={cn("absolute inset-y-0 left-0 w-[3px]", attentionBar[attention])}
          aria-hidden
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{row.project.name}</div>
          <div className="mt-0.5 truncate text-caption text-text-muted">
            <span className="mono">{row.project.code}</span> · {overview.region} ·{" "}
            {row.project.customer}
          </div>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-caption">
          <span className="text-text-secondary">
            Проверено позиций{" "}
            <span className="tnum text-text-primary">
              {fmtNum(overview.specTotal - overview.specUnverified)}
            </span>{" "}
            из <span className="tnum">{fmtNum(overview.specTotal)}</span>
          </span>
          <span className="tnum text-text-muted">{overview.docVersion}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
          <div
            className={cn("h-full rounded-full", overview.specUnverified ? "bg-warn" : "bg-ok")}
            style={{ width: `${verifiedPct}%` }}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-1.5 border-t border-border pt-3">
        {[
          { label: "Непроверено", value: overview.specUnverified, tone: "warn" as const },
          { label: "Запросов", value: overview.activeRequests },
          { label: "Просрочено", value: overview.overdueRequests, tone: "danger" as const },
          { label: "Изменений", value: overview.openChanges },
        ].map((item) => (
          <div key={item.label} className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="truncate text-caption text-text-muted">{item.label}</dt>
            <dd className="text-[14px]">
              <Count value={item.value} tone={item.tone} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 text-caption text-text-muted">
        Ответственный: {employeeName(row.project.manager)}
      </div>
    </button>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { employeeName, employees } = useDirectory();
  const createProject = useCreateProject();
  const managersList = employees.filter((item) => item.role === "manager");
  const [manager, setManager] = useState(managersList[0]?.id ?? "");
  const today = useNow().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(`${Number(today.slice(0, 4)) + 1}${today.slice(4)}`);
  const datesInvalid = !start || !end || end < start;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (datesInvalid) return;
    const data = new FormData(e.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "").trim();
    const name = field("name");
    createProject.mutate(
      {
        name,
        code: field("code"),
        region: field("region"),
        customer: field("customer"),
        contractNumber: field("contract"),
        startDate: start,
        endDate: end,
        managerId: manager,
      },
      {
        onSuccess: (project) => {
          onOpenChange(false);
          toast.success(`Объект «${name}» создан`, {
            description: "Загрузите проектную документацию, чтобы извлечь спецификацию материалов.",
          });
          onCreated(project.id);
        },
        onError: (error) => toast.error("Объект не создан", { description: error.message }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Новый объект</DialogTitle>
          <DialogDescription>
            Спецификация, сроки этапов и контрольные точки заполнятся после загрузки документации и
            договора.
          </DialogDescription>
        </DialogHeader>
        <form id="create-project" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="p-name">Название</Label>
            <Input id="p-name" name="name" required placeholder="ЖК «…», корпус …" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-code">Код</Label>
            <Input id="p-code" name="code" required placeholder="СК-4" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-region">Регион</Label>
            <Input id="p-region" name="region" required placeholder="Москва" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-customer">Заказчик</Label>
            <Input id="p-customer" name="customer" required placeholder="ГК «…»" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-contract">Договор</Label>
            <Input id="p-contract" name="contract" placeholder="№ договора" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-start">Начало работ</Label>
            <Input
              id="p-start"
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-end">Срок сдачи</Label>
            <Input
              id="p-end"
              type="date"
              required
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              aria-invalid={datesInvalid}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Ответственный</Label>
            <Select value={manager} onValueChange={setManager}>
              <SelectTrigger>
                <SelectValue>{employeeName(manager)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {managersList.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} — {item.position}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" form="create-project" variant="accent">
            Создать объект
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
