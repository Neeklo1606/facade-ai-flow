import { useEffect, useMemo, useState, type FormEvent } from "react";
import { recordAction } from "@/lib/guide/telemetry";
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
import { ToneDot } from "@/components/v3";
import { healthField, type V3Tone } from "@/components/v3/classes";
import { PageHeader } from "@/components/common/PageHeader";
import { FilterChip } from "@/components/common/FilterBar";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { useAccess } from "@/api/access";
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
import { ObjectsList } from "@/components/project/ObjectsList";
import { legacyModulesEnabled } from "@/lib/legacy-modules";
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
  /** Форма, которую открыла шторка «+» (ADR-026, п. 4) */
  new?: "project" | undefined;
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
    new: search["new"] === "project" ? "project" : undefined,
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
      { title: "Объекты — гайка" },
      {
        name: "description",
        content: "Объекты: что сделано по захваткам и где не пришёл отчёт с площадки.",
      },
      { property: "og:title", content: "Объекты — гайка" },
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

/**
 * Без флага `legacy_modules` реестр — ГАЙКИ (ADR-041): ход работ и пропущенные отчёты
 * вместо строк спецификации и ответов поставщиков. Реестр прежнего контура остаётся под флагом.
 */
function ProjectsPage() {
  return legacyModulesEnabled() ? <LegacyProjectsPage /> : <GaikaProjectsPage />;
}

function GaikaProjectsPage() {
  const registry = useQuery(queries.projects());
  return (
    <>
      <PageHeader title="Объекты" />
      {registry.data ? <ObjectsList items={registry.data} /> : <ScreenSkeleton kind="cards" />}
    </>
  );
}

function LegacyProjectsPage() {
  const { employeeName } = useDirectory();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [createOpen, setCreateOpen] = useState(false);
  // Шторка «+» открывает форму адресом (ADR-026, п. 4): параметр гасится сразу после открытия
  useEffect(() => {
    if (search.new !== "project") return;
    setCreateOpen(true);
    void navigate({ search: (prev) => ({ ...prev, new: undefined }), replace: true });
  }, [search.new, navigate]);
  const [exporting, setExporting] = useState(false);
  // Создание объекта — запись в объектах, выгрузка — право выгрузок (ADR-012)
  const { can } = useAccess();
  const canCreate = can("projects", "write");
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
      recordAction("exportExcel");
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
            Выберите объект, чтобы открыть раздел «{sectionLabels[search.section]}».
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSearch({ section: undefined, sectionStatus: undefined })}
          >
            <X className="size-3.5" /> Все объекты
          </Button>
        </div>
      )}

      <PageHeader
        title="Объекты"
        actions={
          canCreate && (
            <Button variant="accent" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Добавить объект
            </Button>
          )
        }
      />
      <p className="sr-only">
        Где требуется внимание: непроверенная спецификация, просроченные ответы поставщиков и
        неразобранные изменения документации.
      </p>

      <FigureTiles
        label="Объекты в числах"
        items={[
          { icon: Building2, label: "Объектов", value: fmtNum(rows.length) },
          {
            icon: AlertTriangle,
            label: "Требуют внимания",
            value: `${totals.attention} из ${rows.length}`,
            tone: totals.attention > 0 ? "danger" : undefined,
          },
          {
            icon: FileSearch,
            label: "Непроверенных строк",
            value: fmtNum(totals.unverified),
            tone: totals.unverified > 0 ? "warn" : undefined,
          },
          {
            icon: Clock,
            label: "Просроченных ответов",
            value: fmtNum(totals.overdue),
            tone: totals.overdue > 0 ? "danger" : undefined,
          },
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

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
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
              <div className="seg hidden lg:inline-flex" role="group" aria-label="Вид реестра">
                <button
                  type="button"
                  aria-pressed={view === "table"}
                  data-active={view === "table"}
                  onClick={() => setSearch({ view: undefined })}
                  className="seg-item focus-ring"
                >
                  <Rows3 className="size-3.5" /> Таблица
                </button>
                <button
                  type="button"
                  aria-pressed={view === "cards"}
                  data-active={view === "cards"}
                  onClick={() => setSearch({ view: "cards" })}
                  className="seg-item focus-ring"
                >
                  <LayoutGrid className="size-3.5" /> Карточки
                </button>
              </div>
              {can("export") && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExport}
                  data-tour="export"
                  loading={exporting}
                  disabled={!rows.length}
                >
                  <FileSpreadsheet className="size-4" /> Выгрузить
                </Button>
              )}
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
                ...(canCreate && {
                  actionLabel: "Добавить объект",
                  onAction: () => setCreateOpen(true),
                }),
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
              <div
                className={cn(
                  "card-v3 hidden overflow-x-auto px-2 py-2",
                  view === "table" && "lg:block",
                )}
              >
                <ProjectsTable rows={rows} onOpen={open} />
              </div>
              <div
                className={cn(
                  "grid gap-x-4 gap-y-6 sm:grid-cols-2 2xl:grid-cols-3",
                  view === "table" && "lg:hidden",
                )}
              >
                {rows.map((row) => (
                  <ProjectCard key={row.id} row={row} onOpen={() => open(row)} />
                ))}
              </div>
            </>
          </ScreenGate>
        </div>
      </div>

      {screen !== "forbidden" && screen !== "error" && canCreate && (
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
    <table className="w-full min-w-[900px] text-table">
      <thead>
        <tr className="h-11 text-left">
          <th className="w-[3px] p-0" aria-hidden />
          <th className="px-3 text-[13px] font-medium text-text-muted">Объект</th>
          <th className="px-2.5 text-[13px] font-medium text-text-muted">Регион</th>
          <th className="hidden px-2.5 text-[13px] font-medium text-text-muted 2xl:table-cell">
            Заказчик
          </th>
          <th className="px-2.5 text-[13px] font-medium text-text-muted">Ответственный</th>
          {numericHeaders.map((header) => (
            <th
              key={header.label}
              title={header.title}
              className="px-2 text-right text-[13px] font-medium whitespace-nowrap text-text-muted"
            >
              {header.label}
            </th>
          ))}
          <th className="px-3 text-[13px] font-medium text-text-muted">Статус</th>
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
              className="group h-[64px] cursor-pointer transition-fast hover:bg-surface-2 focus-ring [&>td:first-child]:rounded-l-[var(--r-md)] [&>td:last-child]:rounded-r-[var(--r-md)]"
            >
              <td className="relative w-[3px] p-0">
                {attention && (
                  <span
                    className={cn(
                      "absolute inset-y-2 left-0 w-[3px] rounded-r-full",
                      attentionBar[attention],
                    )}
                    role="img"
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
              <td className="hidden px-2.5 text-text-secondary 2xl:table-cell">
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

/**
 * Число реестра плиткой v3: подпись сверху, значение крупно под ней. Порядок в тексте
 * экрана тот же, что у прежней полосы: подпись, затем значение (по нему сверяются цифры).
 */
function FigureTiles({
  items,
  label,
}: {
  items: {
    icon: typeof Building2;
    label: string;
    value: string;
    tone?: "danger" | "warn" | undefined;
  }[];
  label: string;
}) {
  return (
    <section
      aria-label={label}
      className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "card-v3 flex min-w-0 flex-col gap-3 px-4 py-4 sm:px-5",
            index === 0 && "col-span-2 sm:col-span-1",
          )}
        >
          <span className="grid size-9 place-items-center rounded-full bg-surface-2">
            <item.icon className="size-4 text-text-2" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="line-clamp-2 text-[13px] leading-[1.35] text-text-3">{item.label}</div>
            <div
              className={cn(
                "tnum mt-1 truncate text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] text-text",
                item.tone === "danger" && "text-danger",
                item.tone === "warn" && "text-warn",
              )}
            >
              {item.value}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

const attentionTone: Record<"critical" | "warning", V3Tone> = {
  critical: "danger",
  warning: "warn",
};

function ProjectCard({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { employeeName } = useDirectory();
  const attention = attentionOf(row.overview);
  const status = projectStatusMeta[row.project.status];
  const tone: V3Tone = attention ? attentionTone[attention] : "ok";
  const { overview } = row;
  const verifiedPct = overview.specTotal
    ? Math.round(((overview.specTotal - overview.specUnverified) / overview.specTotal) * 100)
    : 100;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring press group flex w-full flex-col gap-3 rounded-[var(--r-2xl)] text-left"
    >
      <div className="card-v3 relative w-full overflow-hidden rounded-[var(--r-2xl)] p-5 transition-fast group-hover:shadow-[var(--lift-2)]">
        <span aria-hidden className={cn("absolute inset-x-0 top-0 h-32", healthField[tone])} />
        <div className="relative flex items-center justify-between gap-3">
          <span className="glass inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-text">
            <ToneDot tone={tone} />
            {status.label}
          </span>
          <span className="mono text-caption text-text-3">{overview.docVersion}</span>
        </div>
        <div className="relative mt-5 flex items-baseline gap-2">
          <span className="tnum text-[44px] leading-none font-semibold tracking-[-0.03em] text-text">
            {verifiedPct}%
          </span>
          <span className="text-[14px] text-text-3">позиций проверено</span>
        </div>
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn("h-full rounded-full", overview.specUnverified ? "bg-warn" : "bg-ok")}
            style={{ width: `${verifiedPct}%` }}
          />
        </div>
        <p className="relative mt-2 text-caption text-text-3">
          Проверено{" "}
          <span className="tnum text-text-2">
            {fmtNum(overview.specTotal - overview.specUnverified)}
          </span>{" "}
          из <span className="tnum">{fmtNum(overview.specTotal)}</span>
        </p>

        <dl className="relative mt-4 grid grid-cols-4 gap-2">
          {[
            { label: "Непроверено", value: overview.specUnverified, tone: "warn" as const },
            { label: "Запросов", value: overview.activeRequests },
            { label: "Просрочено", value: overview.overdueRequests, tone: "danger" as const },
            { label: "Изменений", value: overview.openChanges },
          ].map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="truncate text-[12px] leading-4 text-text-3">{item.label}</dt>
              <dd className="mt-0.5 text-[15px] font-medium">
                <Count value={item.value} tone={item.tone} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <span className="block w-full px-1 text-center">
        <span className="block truncate text-[15px] leading-[1.3] font-medium text-text">
          {row.project.name}
        </span>
        <span className="mt-0.5 block truncate text-[13px] leading-[1.35] text-text-3">
          <span className="mono">{row.project.code}</span> · {overview.region} ·{" "}
          {employeeName(row.project.manager)}
        </span>
      </span>
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
