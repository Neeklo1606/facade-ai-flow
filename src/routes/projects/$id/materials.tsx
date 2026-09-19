import { useMemo, useState } from "react";
import { DEMO_POSITIONS_NOT_LOADED } from "@/lib/demo-copy";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  CircleDashed,
  FileText,
  Inbox,
  PackageCheck,
  PackageSearch,
  Send,
  ShoppingCart,
  UserCheck,
  X,
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
import { MaterialDrawer } from "@/components/materials/MaterialDrawer";
import { CreateRfqDialog } from "@/components/procurement/CreateRfqDialog";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { useAccess } from "@/api/access";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { useScreenState } from "@/lib/screen-state";
import { ConfidenceLabel } from "@/components/common/ConfidenceIndicator";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterSelect } from "@/components/common/FilterSelect";
import {
  isActivePosition as isActive,
  isReadyForRequest,
  isVerifiedPosition as isVerified,
} from "@/contracts";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PositionView } from "@/api/types";
import { queries } from "@/api/queries";
import { purchaseTone, reviewLabel } from "@/lib/project-meta";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  purchaseOrder,
  purchaseStatusLabel,
  type ExtractedPosition,
  type PurchaseStatus,
} from "@/contracts";
import { prefetch } from "@/api/prefetch";

/** Иконки этапов закупки в полосе метрик */
const stageIcon: Record<PurchaseStatus, LucideIcon> = {
  none: CircleDashed,
  requested: Send,
  offers: Inbox,
  supplier_selected: UserCheck,
  ordered: ShoppingCart,
  delivered: PackageCheck,
};

type ReviewFilter = "verified" | "pending" | "attention" | "check" | "excluded";
type CharsFilter = "with" | "without";

interface MaterialsSearch {
  group?: string | undefined;
  review?: ReviewFilter | undefined;
  purchase?: PurchaseStatus | undefined;
  chars?: CharsFilter | undefined;
  position?: string | undefined;
}

const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const reviewValues: ReviewFilter[] = ["verified", "pending", "attention", "check", "excluded"];

export const Route = createFileRoute("/projects/$id/materials")({
  validateSearch: (search: Record<string, unknown>): MaterialsSearch => {
    const review = str(search["review"]);
    const purchase = str(search["purchase"]);
    const chars = str(search["chars"]);
    return {
      group: str(search["group"]),
      review:
        review && reviewValues.includes(review as ReviewFilter)
          ? (review as ReviewFilter)
          : undefined,
      purchase:
        purchase && purchaseOrder.includes(purchase as PurchaseStatus)
          ? (purchase as PurchaseStatus)
          : undefined,
      chars: chars === "with" || chars === "without" ? chars : undefined,
      position: str(search["position"]),
    };
  },
  loader: async ({ params, context }) => {
    const [result] = await Promise.all([
      loadProject(context.queryClient, params.id),
      prefetch(context.queryClient, queries.positionFacets({ projectId: params.id })),
      prefetch(context.queryClient, queries.documents(params.id)),
    ]);
    return result;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `Материалы — ${loaderData.project?.name ?? "Объект"} — neeklo FieldOps` }]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: withProject(MaterialsPage),
});

const reviewFilterLabel: Record<ReviewFilter, string> = {
  verified: "Проверено человеком",
  pending: "Не проверено",
  attention: "Требует внимания",
  check: "Не удалось определить",
  excluded: "Исключено",
};

const viewOfReview: Record<ReviewFilter, PositionView> = {
  verified: "verified",
  pending: "pending",
  attention: "attention",
  check: "check",
  excluded: "excluded",
};

/** Строк раздела за один запрос: следующие — по «Показать ещё» (P3-3) */
const PAGE = 40;

interface GroupFilter {
  projectId: string;
  view: PositionView;
  stage?: PurchaseStatus | undefined;
  chars?: CharsFilter | undefined;
}

/** Выделенная позиция: раздел — для счётчика раздела, ready — можно ли запросить цены */
type Selection = Map<string, { group: string; ready: boolean }>;

function useGroupPages(filter: GroupFilter, group: string, enabled: boolean) {
  const query = useInfiniteQuery({
    ...queries.positionPages({ ...filter, group, limit: PAGE }),
    enabled,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return { ...query, items };
}

function MaterialsPage({ project, overview }: ProjectPageProps): React.JSX.Element {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const filter: GroupFilter = {
    projectId: project.id,
    view: search.review ? viewOfReview[search.review] : "active",
    stage: search.purchase,
    chars: search.chars,
  };
  // Счётчики объекта (этапы закупки, список разделов) и счётчики под фильтрами считает сервер
  const scopeQuery = useQuery(queries.positionFacets({ projectId: project.id }));
  const filteredQuery = useQuery(queries.positionFacets(filter));
  // Запрос поставщикам — запись в закупках; лист документа — в разделе документов (ADR-012)
  const { can } = useAccess();
  const canRequest = can("procurement", "write");
  const canDocuments = can("documents");
  const documentsQuery = useQuery({ ...queries.documents(project.id), enabled: canDocuments });
  const openItemQuery = useQuery({
    ...queries.position(search.position ?? ""),
    enabled: !!search.position,
  });
  const documents = useMemo(
    () => (documentsQuery.data ?? []).map((item) => item.document),
    [documentsQuery.data],
  );

  const [selected, setSelected] = useState<Selection>(new Map());
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);

  const setSearch = (patch: Partial<MaterialsSearch>) =>
    navigate({
      search: (prev: MaterialsSearch) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    });

  const groups = (scopeQuery.data?.groups ?? []).map((item) => item.group);
  const grouped = (filteredQuery.data?.groups ?? []).filter(
    (item) => !search.group || item.group === search.group,
  );
  const shownTotal = grouped.reduce((acc, item) => acc + item.total, 0);
  const stages = scopeQuery.data?.stages;
  const readyTotal = scopeQuery.data?.readyForRequest ?? 0;

  const eligibleCount = [...selected.values()].filter((item) => item.ready).length;
  const filtersActive = Boolean(search.group || search.review || search.purchase || search.chars);
  const openItem = openItemQuery.data ?? null;
  const docTitle = (id: string) => documents.find((doc) => doc.id === id)?.title ?? "Документ";

  const toggle = (item: ExtractedPosition, value: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (value) next.set(item.id, { group: item.group, ready: isReadyForRequest(item) });
      else next.delete(item.id);
      return next;
    });
  /** Раздел целиком, включая ещё не загруженные страницы: id берём с сервера */
  const toggleGroup = async (group: string, value: boolean) => {
    const ids = await queryClient.fetchQuery(queries.positionSelection({ ...filter, group }));
    setSelected((prev) => {
      const next = new Map(prev);
      for (const item of ids) {
        if (value) next.set(item.id, { group, ready: item.ready });
        else next.delete(item.id);
      }
      return next;
    });
  };
  const selectedIn = (group: string) =>
    [...selected.values()].filter((item) => item.group === group).length;

  const resetFilters = () =>
    setSearch({ group: undefined, review: undefined, purchase: undefined, chars: undefined });

  const pendingDocs = documents.filter(
    (doc) =>
      doc.projectId === project.id && (doc.status === "uploaded" || doc.status === "recognizing"),
  );
  const countedOnly = (scopeQuery.data?.views.all ?? 0) === 0 && (overview?.specTotal ?? 0) > 0;
  const screen = useScreenState({
    pending: scopeQuery.isPending || filteredQuery.isPending,
    error: scopeQuery.isError || filteredQuery.isError,
    empty: (scopeQuery.data?.views.all ?? 0) === 0,
    filtered: shownTotal === 0,
    partial: pendingDocs.length > 0,
  });
  const blocked =
    screen === "loading" || screen === "error" || screen === "forbidden" || screen === "empty";

  return (
    <>
      <SubpageHeader
        project={project}
        title="Материалы"
        meta={
          <span id="materials-summary" className="text-caption text-text-secondary">
            Позиций{" "}
            <b className="tnum font-semibold text-text-primary">
              {fmtNum(overview?.specTotal ?? 0)}
            </b>{" "}
            · проверено{" "}
            <b className="tnum font-semibold text-text-primary">
              {fmtNum((overview?.specTotal ?? 0) - (overview?.specUnverified ?? 0))}
            </b>{" "}
            · готовы к запросу{" "}
            <b className="tnum font-semibold text-text-primary">{fmtNum(readyTotal)}</b>
          </span>
        }
        actions={
          canRequest && (
            <Button
              variant="accent"
              disabled={blocked || (eligibleCount === 0 && readyTotal === 0)}
              // Недоступна — причина в подписи шапки: «готовы к запросу 0» (ADR-015)
              aria-describedby="materials-summary"
              onClick={() => setRequestOpen(true)}
              data-tour="create-request"
            >
              <Send className="size-4" /> Создать запрос поставщикам
              {selected.size > 0 && (
                <span className="tnum opacity-80">{fmtNum(eligibleCount)}</span>
              )}
            </Button>
          )
        }
      />

      {/* Этапы закупки проверенных позиций: ячейка полосы — фильтр списка */}
      <MetricStrip
        className="mb-6"
        items={purchaseOrder.map((status) => {
          const active = search.purchase === status;
          return {
            icon: stageIcon[status],
            label: purchaseStatusLabel[status],
            value: fmtNum(stages?.[status] ?? 0),
            selected: active,
            onSelect: () => setSearch({ purchase: active ? undefined : status, review: undefined }),
          };
        })}
      />

      <div data-main-zone className="space-y-4">
        {screen === "partial" && (
          <StateBanner
            tone="warn"

            title={`Позиции из ${pendingDocs.length} ${pendingDocs.length === 1 ? "документа" : "документов"} ещё не извлечены`}
          >
            {pendingDocs.map((doc) => doc.title).join(", ")} — обрабатываются. Реестр дополнится
            автоматически, запрашивать цены можно уже по переданным в закупку позициям.
          </StateBanner>
        )}
        {screen === "processing" && (
          <StateBanner
            tone="info"

            title="Пересчитываем этапы закупки после новых ответов поставщиков"
          >
            Статусы позиций обновятся через несколько секунд.
          </StateBanner>
        )}

        <section className="card-surface overflow-hidden">
          <div className="grid grid-cols-2 items-center gap-2 border-b border-border px-4 py-2.5 sm:flex sm:flex-wrap">
            <FilterSelect
              label="Раздел"
              allLabel="Все разделы"
              value={search.group}
              options={groups.map((g) => ({ value: g, label: g }))}
              onChange={(group) => setSearch({ group })}
            />
            <FilterSelect
              label="Проверка"
              allLabel="Любая проверка"
              value={search.review}
              options={reviewValues.map((value) => ({ value, label: reviewFilterLabel[value] }))}
              onChange={(review) => setSearch({ review: review as ReviewFilter | undefined })}
            />
            <FilterSelect
              label="Закупка"
              allLabel="Любой этап закупки"
              value={search.purchase}
              options={purchaseOrder.map((value) => ({ value, label: purchaseStatusLabel[value] }))}
              onChange={(purchase) =>
                setSearch({ purchase: purchase as PurchaseStatus | undefined })
              }
            />
            <FilterSelect
              label="Характеристики"
              allLabel="С характеристиками и без"
              value={search.chars}
              options={[
                { value: "with", label: "Есть характеристики" },
                { value: "without", label: "Без характеристик" },
              ]}
              onChange={(chars) => setSearch({ chars: chars as CharsFilter | undefined })}
            />
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Сбросить
              </Button>
            )}
            <span className="col-span-2 text-caption text-text-muted sm:ml-auto">
              Позиций: {fmtNum(shownTotal)}
            </span>
          </div>

          {canRequest && selected.size > 0 && (
            <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-2 bg-surface-2 px-4 py-2">
              <span className="text-[13px]">
                Выбрано <b className="tnum">{fmtNum(selected.size)}</b>
                {eligibleCount !== selected.size && (
                  <span className="text-text-secondary">
                    {" "}
                    · можно запросить {fmtNum(eligibleCount)}, остальные не проверены, без
                    подтверждённого материала или уже в закупке
                  </span>
                )}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
                  <X className="size-3.5" /> Снять выделение
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={eligibleCount === 0}
                  onClick={() => setRequestOpen(true)}
                  data-tour="create-request"
                >
                  <Send className="size-3.5" /> Создать запрос · {fmtNum(eligibleCount)}
                </Button>
              </div>
            </div>
          )}

          <ScreenGate
            state={screen}
            onRetry={() => void Promise.all([scopeQuery.refetch(), filteredQuery.refetch()])}
            skeleton={<ScreenSkeleton kind="table" rows={8} />}
            copy={{
              section: "Материалы",
              roles: "руководителю проекта, ПТО и снабжению",
              errorTitle: "Не удалось загрузить материалы",
              // Число позиций в шапке есть, а списка нет — позиции объекта не загружены (R20)
              empty: countedOnly
                ? {
                    icon: PackageSearch,
                    title: `Позиции не загружены: ${fmtNum(overview?.specTotal ?? 0)} по документации`,
                    description: DEMO_POSITIONS_NOT_LOADED,
                  }
                : {
                    icon: PackageSearch,
                    title: "Материалов пока нет",
                    description:
                      "Загрузите спецификацию в документации объекта и подтвердите извлечённые позиции — они появятся здесь, и по ним можно будет запросить цены.",
                    ...(can("documents", "write") && {
                      actionLabel: "Загрузить спецификацию",
                      onAction: () =>
                        navigate({ to: "/projects/$id/documents", params: { id: project.id } }),
                    }),
                  },
              filtered: {
                onReset: resetFilters,
                description:
                  "Под выбранные раздел, проверку и этап закупки не попала ни одна позиция. Сбросьте фильтры.",
              },
            }}
          >
            <div className="lg:hidden">
              {grouped.map((summary) => (
                <MobileGroup
                  key={summary.group}
                  filter={filter}
                  summary={summary}
                  selected={selected}
                  onToggle={toggle}
                  onOpen={(id) => setSearch({ position: id })}
                  projectId={project.id}
                  selectable={canRequest}
                  docLink={canDocuments}
                />
              ))}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1240px] text-table">
                <thead className="sticky top-0 z-10">
                  <tr className="h-10 bg-subtle text-left text-[11px] font-medium whitespace-nowrap text-text-muted">
                    {canRequest ? (
                      <th className="w-10 pl-4" aria-label="Выделение" />
                    ) : (
                      <th className="w-4" aria-hidden />
                    )}
                    <th className="px-2.5">Нормализованное</th>
                    <th className="px-2.5">Проектное</th>
                    <th className="px-2.5">Характеристики</th>
                    <th className="px-2.5 text-right">Кол-во</th>
                    <th className="px-2.5">Ед.</th>
                    <th className="px-2.5">Раздел</th>
                    <th className="px-2.5">Проверка</th>
                    <th className="px-2.5">Источник</th>
                    <th className="px-4">Закупка</th>
                  </tr>
                </thead>
                {grouped.map((summary) => (
                  <DesktopGroup
                    key={summary.group}
                    filter={filter}
                    summary={summary}
                    open={!collapsed.includes(summary.group)}
                    onOpenChange={(open) =>
                      setCollapsed((prev) =>
                        open ? prev.filter((g) => g !== summary.group) : [...prev, summary.group],
                      )
                    }
                    selected={selected}
                    selectedCount={selectedIn(summary.group)}
                    onToggle={toggle}
                    onToggleGroup={(value) => void toggleGroup(summary.group, value)}
                    onOpen={(id) => setSearch({ position: id })}
                    projectId={project.id}
                    selectable={canRequest}
                    docLink={canDocuments}
                  />
                ))}
              </table>
            </div>
          </ScreenGate>
        </section>
      </div>

      {!blocked && canRequest && (
        <MobileActionBar>
          <Button
            variant="accent"
            disabled={eligibleCount === 0 && readyTotal === 0}
            onClick={() => setRequestOpen(true)}
            data-tour="create-request"
          >
            <Send className="size-4" /> Запросить цены
            {selected.size > 0 ? ` · ${fmtNum(eligibleCount)}` : ""}
          </Button>
        </MobileActionBar>
      )}

      <CreateRfqDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        project={project}
        region={overview?.region ?? "—"}
        initialIds={[...selected.keys()]}
        onCreated={() => setSelected(new Map())}
      />
      {openItem && (
        <MaterialDrawer
          item={openItem}
          documentTitle={docTitle(openItem.documentId)}
          onOpenChange={(v) => !v && setSearch({ position: undefined })}
        />
      )}
    </>
  );
}

interface GroupProps {
  filter: GroupFilter;
  summary: { group: string; total: number; verified: number };
  selected: Selection;
  onToggle: (item: ExtractedPosition, value: boolean) => void;
  onOpen: (id: string) => void;
  projectId: string;
  /** Выделение нужно только для запроса поставщикам: у роли без записи в закупках его нет */
  selectable: boolean;
  /** Ссылка на лист документа: у роли без документации — только номер листа */
  docLink: boolean;
}

function DesktopGroup({
  filter,
  summary,
  open,
  onOpenChange,
  selected,
  selectedCount,
  onToggle,
  onToggleGroup,
  onOpen,
  projectId,
  selectable,
  docLink,
}: GroupProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onToggleGroup: (value: boolean) => void;
}) {
  const { group, total, verified } = summary;
  const pages = useGroupPages(filter, group, open);
  const rest = total - pages.items.length;
  return (
    <tbody>
      <tr className="h-10 border-y border-border bg-raised">
        <td className="pl-4">
          {selectable && (
            <Checkbox
              aria-label={`Выделить раздел ${group}`}
              checked={
                selectedCount === 0 ? false : selectedCount >= total ? true : "indeterminate"
              }
              onCheckedChange={(value) => onToggleGroup(value === true)}
            />
          )}
        </td>
        <td colSpan={9} className="px-2.5">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
            className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-xs)] text-[13px] font-semibold"
          >
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
            {group}
            <span className="tnum font-normal text-text-muted">
              {fmtNum(total)} поз. · проверено {fmtNum(verified)}
              {selectedCount > 0 && ` · выбрано ${fmtNum(selectedCount)}`}
            </span>
          </button>
        </td>
      </tr>
      {open &&
        pages.items.map((item) => (
          <MaterialRow
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={onToggle}
            onOpen={() => onOpen(item.id)}
            projectId={projectId}
            selectable={selectable}
            docLink={docLink}
          />
        ))}
      {/* Место под первую страницу раздела занимается заранее: иначе строки толкают таблицу вниз */}
      {open &&
        pages.isPending &&
        Array.from({ length: Math.min(PAGE, total) }).map((_, index) => (
          <tr key={`skeleton-${index}`} className="h-14 border-b border-border">
            <td className="pl-4">
              <span className="skeleton block size-4 rounded-[4px]" />
            </td>
            <td colSpan={9} className="px-2.5">
              <span className="skeleton block h-3 w-1/3" />
            </td>
          </tr>
        ))}
      {open && !pages.isPending && pages.hasNextPage && (
        <tr className="border-b border-border">
          <td colSpan={10} className="px-4 py-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pages.isFetchingNextPage}
              onClick={() => void pages.fetchNextPage()}
            >
              Показать ещё {fmtNum(Math.min(PAGE, rest))} из {fmtNum(rest)}
            </Button>
          </td>
        </tr>
      )}
    </tbody>
  );
}

/** Телефон: позиции карточками, выделение и источник — крупными областями нажатия. */
function MobileGroup({
  filter,
  summary,
  selected,
  onToggle,
  onOpen,
  projectId,
  selectable,
  docLink,
}: GroupProps) {
  const { group, total } = summary;
  const pages = useGroupPages(filter, group, true);
  const rest = total - pages.items.length;
  return (
    <section>
      <h3 className="sticky top-0 z-10 border-y border-border bg-raised px-4 py-2 text-[13px] font-semibold">
        {group} <span className="tnum font-normal text-text-muted">{fmtNum(total)}</span>
      </h3>
      <ul className="divide-y divide-border">
        {pages.items.map((item) => {
          const review = reviewLabel(item);
          return (
            <li
              key={item.id}
              className={cn("flex gap-1 pr-4", selected.has(item.id) && "bg-surface-2")}
            >
              {selectable ? (
                <label className="grid min-h-11 w-12 shrink-0 cursor-pointer place-items-center self-stretch">
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={(v) => onToggle(item, v === true)}
                    aria-label={`Выделить поз. ${item.position}`}
                  />
                </label>
              ) : (
                <span className="w-3 shrink-0" aria-hidden />
              )}
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="min-w-0 flex-1 py-3 text-left"
              >
                <p className={cn("text-[14px] font-medium", !item.normalizedName && "text-warn")}>
                  {item.normalizedName ?? "Требует нормализации"}
                </p>
                {item.normalizedName && item.matchStatus !== "confirmed" && (
                  <p className="text-caption text-warn">Сопоставление не подтверждено</p>
                )}
                <p className="mt-0.5 line-clamp-2 text-caption text-text-muted">
                  {item.position} · {item.projectName}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="tnum text-[14px] font-semibold">
                    {item.qty ? fmtNum(item.qty) : "—"}{" "}
                    <span className="font-normal text-text-secondary">{item.unit}</span>
                  </span>
                  {review ? (
                    <StatusBadge tone={review.tone}>{review.label}</StatusBadge>
                  ) : (
                    <ConfidenceLabel value={item.confidence} />
                  )}
                  {isVerified(item) && item.handedOverAt !== null && (
                    <StatusBadge tone={purchaseTone[item.purchase]}>
                      {purchaseStatusLabel[item.purchase]}
                    </StatusBadge>
                  )}
                </div>
              </button>
              {docLink && (
                <Link
                  to="/projects/$id/documents/$docId"
                  params={{ id: projectId, docId: item.documentId }}
                  search={{ position: item.id }}
                  className="grid size-11 shrink-0 place-items-center self-center rounded-[var(--r-sm)] text-info"
                  aria-label={`Лист ${item.sheetNumber}`}
                >
                  <FileText className="size-4" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {pages.hasNextPage && (
        <div className="p-3">
          <Button
            variant="secondary"
            className="w-full"
            disabled={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
          >
            Показать ещё {fmtNum(Math.min(PAGE, rest))} из {fmtNum(rest)}
          </Button>
        </div>
      )}
    </section>
  );
}

function MaterialRow({
  item,
  selected,
  onToggle,
  onOpen,
  projectId,
  selectable,
  docLink,
}: {
  item: ExtractedPosition;
  selected: boolean;
  onToggle: (item: ExtractedPosition, value: boolean) => void;
  onOpen: () => void;
  projectId: string;
  selectable: boolean;
  docLink: boolean;
}) {
  const review = reviewLabel(item);
  const verified = isVerified(item);
  const inactive = !isActive(item);
  return (
    <tr
      onClick={onOpen}
      className={cn(
        "group h-12 cursor-pointer border-b border-border transition-fast last:border-0 hover:bg-hover",
        selected && "bg-surface-2 hover:bg-surface-2",
        inactive && "text-text-muted",
      )}
    >
      <td className="pl-4" onClick={(e) => e.stopPropagation()}>
        {selectable && (
          <label className="grid min-h-11 cursor-pointer place-items-center lg:min-h-0">
            <Checkbox
              checked={selected}
              onCheckedChange={(value) => onToggle(item, value === true)}
              aria-label={`Выделить поз. ${item.position}`}
            />
          </label>
        )}
      </td>
      <td className="max-w-[190px] px-2.5">
        {item.normalizedName ? (
          <div
            className="truncate font-medium text-text-primary group-hover:text-text"
            title={item.normalizedName}
          >
            {item.normalizedName}
          </div>
        ) : (
          <span className="text-caption font-medium text-warn">Требует нормализации</span>
        )}
        {/* Предложение системы, пока его не подтвердили, в запрос не уходит (ADR-014) */}
        {item.normalizedName && item.matchStatus !== "confirmed" && (
          <div className="text-caption text-warn">Сопоставление не подтверждено</div>
        )}
      </td>
      <td className="max-w-[200px] px-2.5">
        <div className="truncate text-text-secondary" title={item.projectName}>
          <span className="mono mr-1.5 text-[11px] text-text-muted">{item.position}</span>
          {item.projectName}
        </div>
      </td>
      <td className="max-w-[150px] px-2.5">
        {item.characteristics.length ? (
          <div
            className="truncate text-caption text-text-secondary"
            title={item.characteristics.map((c) => `${c.label}: ${c.value}`).join("; ")}
          >
            {item.characteristics.map((c) => c.value).join(" · ")}
          </div>
        ) : (
          <span className="text-caption text-warn">не указаны</span>
        )}
      </td>
      <td className="tnum px-2.5 text-right font-medium text-text-primary">
        {item.qty ? fmtNum(item.qty) : "—"}
      </td>
      <td className="px-2.5 whitespace-nowrap text-text-secondary">{item.unit}</td>
      <td className="max-w-[118px] px-2.5">
        <div className="truncate text-text-secondary" title={item.group}>
          {item.group}
        </div>
      </td>
      <td className="px-2.5 whitespace-nowrap">
        {review ? (
          <StatusBadge tone={review.tone}>{review.label}</StatusBadge>
        ) : (
          <ConfidenceLabel value={item.confidence} />
        )}
      </td>
      <td className="px-2.5" onClick={(e) => e.stopPropagation()}>
        {docLink ? (
          <Link
            to="/projects/$id/documents/$docId"
            params={{ id: projectId, docId: item.documentId }}
            search={{ position: item.id }}
            title="Открыть позицию в документе"
            className="focus-ring inline-flex h-11 items-center gap-1 rounded-[var(--r-xs)] px-1.5 text-[12px] whitespace-nowrap text-info transition-fast hover:bg-info-bg lg:h-6"
          >
            <FileText className="size-3" /> л. {item.sheetNumber}
          </Link>
        ) : (
          <span className="px-1.5 text-[12px] whitespace-nowrap text-text-muted">
            л. {item.sheetNumber}
          </span>
        )}
      </td>
      <td className="px-2.5 pr-4 whitespace-nowrap">
        {verified && item.handedOverAt !== null ? (
          <StatusBadge tone={purchaseTone[item.purchase]}>
            {purchaseStatusLabel[item.purchase]}
          </StatusBadge>
        ) : (
          <span className="text-caption text-text-muted">
            {verified ? "не передано в закупку" : "после проверки"}
          </span>
        )}
      </td>
    </tr>
  );
}
