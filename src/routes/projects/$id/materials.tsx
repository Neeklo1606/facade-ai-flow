import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, FileText, PackageSearch, Send, X } from "lucide-react";
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
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { useScreenState } from "@/lib/screen-state";
import { ConfidenceLabel, confidenceLevel } from "@/components/common/ConfidenceIndicator";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterSelect } from "@/components/common/FilterSelect";
import { isActive, isReadyForRequest, isVerified } from "@/lib/spec-store";
import { useQuery } from "@tanstack/react-query";
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
  loader: ({ params, context }) => loadProject(context.queryClient, params.id),
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

function matchesReview(item: ExtractedPosition, filter: ReviewFilter | undefined) {
  if (!filter) return isActive(item);
  const level = confidenceLevel(item.confidence);
  switch (filter) {
    case "verified":
      return isVerified(item);
    case "pending":
      return item.review === "pending";
    case "attention":
      return item.review === "pending" && level === "mid";
    case "check":
      return item.review === "pending" && level === "low";
    case "excluded":
      return !isActive(item);
  }
}

const PAGE = 40;

function MaterialsPage({ project, overview }: ProjectPageProps): React.JSX.Element {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // До серверного пейджинга и фильтров (P3-3) реестр материалов загружает позиции объекта целиком
  const positionsQuery = useQuery(queries.positions({ projectId: project.id, limit: 5000 }));
  const documentsQuery = useQuery(queries.documents(project.id));
  const positions = useMemo(() => positionsQuery.data?.items ?? [], [positionsQuery.data]);
  const documents = useMemo(
    () => (documentsQuery.data ?? []).map((item) => item.document),
    [documentsQuery.data],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [requestOpen, setRequestOpen] = useState(false);

  const setSearch = (patch: Partial<MaterialsSearch>) =>
    navigate({
      search: (prev: MaterialsSearch) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    });

  const groups = useMemo(() => [...new Set(positions.map((item) => item.group))], [positions]);

  const rows = useMemo(
    () =>
      positions
        .filter((item) => matchesReview(item, search.review))
        .filter((item) => (search.group ? item.group === search.group : true))
        .filter((item) =>
          search.purchase
            ? item.purchase === search.purchase && isVerified(item) && item.handedOverAt !== null
            : true,
        )
        .filter((item) =>
          search.chars === "with"
            ? item.characteristics.length > 0
            : search.chars === "without"
              ? item.characteristics.length === 0
              : true,
        ),
    [positions, search.review, search.group, search.purchase, search.chars],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ExtractedPosition[]>();
    for (const item of rows) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [rows]);

  const purchaseCounts = useMemo(() => {
    const verified = positions.filter((item) => isVerified(item) && item.handedOverAt !== null);
    return Object.fromEntries(
      purchaseOrder.map((status) => [
        status,
        verified.filter((item) => item.purchase === status).length,
      ]),
    ) as Record<PurchaseStatus, number>;
  }, [positions]);

  const selectedItems = useMemo(
    () => positions.filter((item) => selected.has(item.id)),
    [positions, selected],
  );
  const eligibleCount = selectedItems.filter(isReadyForRequest).length;
  const filtersActive = Boolean(search.group || search.review || search.purchase || search.chars);
  const openItem = search.position
    ? (positions.find((item) => item.id === search.position) ?? null)
    : null;
  const docTitle = (id: string) => documents.find((doc) => doc.id === id)?.title ?? "Документ";

  const toggle = (id: string, value: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleMany = (ids: string[], value: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (value ? next.add(id) : next.delete(id)));
      return next;
    });

  const resetFilters = () =>
    setSearch({ group: undefined, review: undefined, purchase: undefined, chars: undefined });

  const pendingDocs = documents.filter(
    (doc) =>
      doc.projectId === project.id && (doc.status === "uploaded" || doc.status === "recognizing"),
  );
  const screen = useScreenState({
    pending: positionsQuery.isPending,
    empty: positions.length === 0,
    filtered: rows.length === 0,
    partial: pendingDocs.length > 0,
  });
  const blocked =
    screen === "loading" || screen === "error" || screen === "forbidden" || screen === "empty";

  return (
    <>
      <SubpageHeader
        project={project}
        title="Материалы"
        description="Что требуется купить: позиции спецификации, их проверка и этап закупки."
        meta={
          <span className="text-caption text-text-secondary">
            Позиций{" "}
            <b className="tnum font-semibold text-text-primary">
              {fmtNum(overview?.specTotal ?? 0)}
            </b>{" "}
            · проверено{" "}
            <b className="tnum font-semibold text-text-primary">
              {fmtNum((overview?.specTotal ?? 0) - (overview?.specUnverified ?? 0))}
            </b>{" "}
            · готовы к запросу{" "}
            <b className="tnum font-semibold text-accent">{fmtNum(purchaseCounts.none)}</b>
          </span>
        }
        actions={
          <Button
            variant="accent"
            disabled={blocked || (eligibleCount === 0 && purchaseCounts.none === 0)}
            onClick={() => setRequestOpen(true)}
            className="hidden sm:inline-flex"
          >
            <Send className="size-4" /> Создать запрос поставщикам
            {selected.size > 0 && <span className="tnum opacity-80">{fmtNum(eligibleCount)}</span>}
          </Button>
        }
      />

      {screen === "partial" && (
        <StateBanner
          tone="warn"
          className="mb-3"
          title={`Позиции из ${pendingDocs.length} ${pendingDocs.length === 1 ? "документа" : "документов"} ещё не извлечены`}
        >
          {pendingDocs.map((doc) => doc.title).join(", ")} — обрабатываются. Реестр дополнится
          автоматически, запрашивать цены можно уже по переданным в закупку позициям.
        </StateBanner>
      )}
      {screen === "processing" && (
        <StateBanner
          tone="info"
          className="mb-3"
          title="Пересчитываем этапы закупки после новых ответов поставщиков"
        >
          Статусы позиций обновятся через несколько секунд.
        </StateBanner>
      )}

      {/* Этапы закупки проверенных позиций */}
      <div className="card-surface mb-4 grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 xl:grid-cols-6">
        {purchaseOrder.map((status) => {
          const active = search.purchase === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setSearch({ purchase: active ? undefined : status, review: undefined })
              }
              className={cn(
                "focus-ring relative bg-surface px-4 py-3 text-left transition-fast hover:bg-hover",
                active && "bg-accent-subtle hover:bg-accent-subtle",
              )}
            >
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-accent" aria-hidden />
              )}
              <span className="block truncate text-caption text-text-secondary">
                {purchaseStatusLabel[status]}
              </span>
              <span
                className={cn(
                  "tnum mt-0.5 block text-[22px] leading-tight font-semibold",
                  status === "none" && purchaseCounts.none > 0 && "text-accent",
                )}
              >
                {fmtNum(purchaseCounts[status])}
              </span>
            </button>
          );
        })}
      </div>

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
            onChange={(purchase) => setSearch({ purchase: purchase as PurchaseStatus | undefined })}
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
            Позиций: {fmtNum(rows.length)}
          </span>
        </div>

        {selected.size > 0 && (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-accent-border bg-accent-subtle px-4 py-2">
            <span className="text-[13px]">
              Выбрано <b className="tnum">{fmtNum(selected.size)}</b>
              {eligibleCount !== selected.size && (
                <span className="text-text-secondary">
                  {" "}
                  · можно запросить {fmtNum(eligibleCount)}, остальные не проверены или уже в
                  закупке
                </span>
              )}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X className="size-3.5" /> Снять выделение
              </Button>
              <Button
                size="sm"
                variant="accent"
                disabled={eligibleCount === 0}
                onClick={() => setRequestOpen(true)}
              >
                <Send className="size-3.5" /> Создать запрос · {fmtNum(eligibleCount)}
              </Button>
            </div>
          </div>
        )}

        <ScreenGate
          state={screen}
          skeleton={<ScreenSkeleton kind="table" rows={8} />}
          copy={{
            section: "Материалы",
            roles: "руководителю проекта, ПТО и снабжению",
            errorTitle: "Не удалось загрузить материалы",
            empty: {
              icon: PackageSearch,
              title: "Материалов пока нет",
              description:
                "Загрузите спецификацию в документации объекта и подтвердите извлечённые позиции — они появятся здесь, и по ним можно будет запросить цены.",
              actionLabel: "Загрузить спецификацию",
              onAction: () =>
                navigate({ to: "/projects/$id/documents", params: { id: project.id } }),
            },
            filtered: {
              onReset: resetFilters,
              description:
                "Под выбранные раздел, проверку и этап закупки не попала ни одна позиция. Сбросьте фильтры.",
            },
          }}
        >
          <MobileMaterials
            grouped={grouped}
            selected={selected}
            onToggle={toggle}
            onOpen={(id) => setSearch({ position: id })}
            projectId={project.id}
          />
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1240px] text-table">
              <thead className="sticky top-0 z-10">
                <tr className="h-10 bg-subtle text-left text-[11px] font-medium whitespace-nowrap text-text-muted">
                  <th className="w-10 pl-4" aria-label="Выделение" />
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
              {grouped.map(([group, items]) => {
                const open = !collapsed.includes(group);
                const limit = limits[group] ?? PAGE;
                const ids = items.map((item) => item.id);
                const selectedInGroup = ids.filter((id) => selected.has(id)).length;
                const verifiedInGroup = items.filter(isVerified).length;
                return (
                  <tbody key={group}>
                    <tr className="h-10 border-y border-border bg-raised">
                      <td className="pl-4">
                        <Checkbox
                          aria-label={`Выделить раздел ${group}`}
                          checked={
                            selectedInGroup === 0
                              ? false
                              : selectedInGroup === ids.length
                                ? true
                                : "indeterminate"
                          }
                          onCheckedChange={(value) => toggleMany(ids, value === true)}
                        />
                      </td>
                      <td colSpan={9} className="px-2.5">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setCollapsed((prev) =>
                              open ? [...prev, group] : prev.filter((g) => g !== group),
                            )
                          }
                          className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-xs)] text-[13px] font-semibold"
                        >
                          <ChevronRight
                            className={cn("size-4 transition-transform", open && "rotate-90")}
                          />
                          {group}
                          <span className="tnum font-normal text-text-muted">
                            {fmtNum(items.length)} поз. · проверено {fmtNum(verifiedInGroup)}
                            {selectedInGroup > 0 && ` · выбрано ${fmtNum(selectedInGroup)}`}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {open &&
                      items
                        .slice(0, limit)
                        .map((item) => (
                          <MaterialRow
                            key={item.id}
                            item={item}
                            selected={selected.has(item.id)}
                            onToggle={toggle}
                            onOpen={() => setSearch({ position: item.id })}
                            projectId={project.id}
                          />
                        ))}
                    {open && items.length > limit && (
                      <tr className="border-b border-border">
                        <td colSpan={10} className="px-4 py-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLimits((prev) => ({ ...prev, [group]: limit + 200 }))}
                          >
                            Показать ещё {fmtNum(Math.min(200, items.length - limit))} из{" "}
                            {fmtNum(items.length - limit)}
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        </ScreenGate>
      </section>

      {!blocked && (
        <MobileActionBar>
          <Button
            variant="accent"
            disabled={eligibleCount === 0 && purchaseCounts.none === 0}
            onClick={() => setRequestOpen(true)}
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
        initialIds={[...selected]}
        onCreated={() => setSelected(new Set())}
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

function MaterialRow({
  item,
  selected,
  onToggle,
  onOpen,
  projectId,
}: {
  item: ExtractedPosition;
  selected: boolean;
  onToggle: (id: string, value: boolean) => void;
  onOpen: () => void;
  projectId: string;
}) {
  const review = reviewLabel(item);
  const verified = isVerified(item);
  const inactive = !isActive(item);
  return (
    <tr
      onClick={onOpen}
      className={cn(
        "group h-12 cursor-pointer border-b border-border transition-fast last:border-0 hover:bg-hover",
        selected && "bg-accent-subtle hover:bg-accent-subtle",
        inactive && "text-text-muted",
      )}
    >
      <td className="pl-4" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onToggle(item.id, value === true)}
          aria-label={`Выделить поз. ${item.position}`}
        />
      </td>
      <td className="max-w-[190px] px-2.5">
        {item.normalizedName ? (
          <div
            className="truncate font-medium text-text-primary group-hover:text-accent"
            title={item.normalizedName}
          >
            {item.normalizedName}
          </div>
        ) : (
          <span className="text-caption font-medium text-warn">Требует нормализации</span>
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
        <Link
          to="/projects/$id/documents/$docId"
          params={{ id: projectId, docId: item.documentId }}
          search={{ position: item.id }}
          title="Открыть позицию в документе"
          className="focus-ring inline-flex h-6 items-center gap-1 rounded-[var(--r-xs)] px-1.5 text-[12px] whitespace-nowrap text-info transition-fast hover:bg-info-bg"
        >
          <FileText className="size-3" /> л. {item.sheetNumber}
        </Link>
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

/** Телефон: позиции карточками, выделение и источник — крупными областями нажатия. */
function MobileMaterials({
  grouped,
  selected,
  onToggle,
  onOpen,
  projectId,
}: {
  grouped: [string, ExtractedPosition[]][];
  selected: Set<string>;
  onToggle: (id: string, value: boolean) => void;
  onOpen: (id: string) => void;
  projectId: string;
}) {
  const [limit, setLimit] = useState(30);
  return (
    <div className="lg:hidden">
      {grouped.map(([group, items]) => (
        <section key={group}>
          <h3 className="sticky top-0 z-10 border-y border-border bg-raised px-4 py-2 text-[13px] font-semibold">
            {group} <span className="tnum font-normal text-text-muted">{fmtNum(items.length)}</span>
          </h3>
          <ul className="divide-y divide-border">
            {items.slice(0, limit).map((item) => {
              const review = reviewLabel(item);
              return (
                <li
                  key={item.id}
                  className={cn("flex gap-1 pr-4", selected.has(item.id) && "bg-accent-subtle")}
                >
                  <label className="grid w-12 shrink-0 cursor-pointer place-items-center self-stretch">
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={(v) => onToggle(item.id, v === true)}
                      aria-label={`Выделить поз. ${item.position}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className="min-w-0 flex-1 py-3 text-left"
                  >
                    <p
                      className={cn("text-[14px] font-medium", !item.normalizedName && "text-warn")}
                    >
                      {item.normalizedName ?? "Требует нормализации"}
                    </p>
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
                  <Link
                    to="/projects/$id/documents/$docId"
                    params={{ id: projectId, docId: item.documentId }}
                    search={{ position: item.id }}
                    className="grid size-11 shrink-0 place-items-center self-center rounded-[var(--r-sm)] text-info"
                    aria-label={`Лист ${item.sheetNumber}`}
                  >
                    <FileText className="size-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {grouped.reduce((acc, [, items]) => acc + items.length, 0) > limit && (
        <div className="p-3">
          <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + 60)}>
            Показать ещё
          </Button>
        </div>
      )}
    </div>
  );
}
