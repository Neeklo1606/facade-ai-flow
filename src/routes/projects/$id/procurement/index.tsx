import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Mail, PackageSearch, Phone, Plus, Send, Truck } from "lucide-react";
import {
  loadProject,
  ProjectNotFound,
  withProject,
  type ProjectPageProps,
} from "@/components/project/ProjectNotFound";
import { SubpageHeader } from "@/components/project/SubpageHeader";
import { CreateRfqDialog } from "@/components/procurement/CreateRfqDialog";
import { ContactFreshnessBadge } from "@/components/procurement/ContactFreshnessBadge";
import { FilterChip } from "@/components/common/FilterBar";
import { FilterSelect } from "@/components/common/FilterSelect";
import { MobileActionBar } from "@/components/common/MobileActionBar";
import { ScreenGate, ScreenSkeleton, StateBanner } from "@/components/common/ScreenStates";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import type { RequestSummary } from "@/api/types";
import { rfqStatusMeta, type RfqStatus } from "@/lib/procurement";
import { useScreenState } from "@/lib/screen-state";
import { fmtDate, fmtDateTime, fmtMoney, fmtReplyDue, fmtNum, plural } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  contactStatusLabel as contactFreshnessLabel,
  type ContactFreshness,
  type Counterparty,
  type SupplierProfile,
  type SupplyRequest,
} from "@/contracts";
import { useDirectory } from "@/api/directory";
import { useRemindSuppliers, useVerifyContact } from "@/api/mutations";
import { prefetch } from "@/api/prefetch";

type View = "requests" | "suppliers";

interface ProcurementSearch {
  view?: View | undefined;
  status?: RfqStatus | "open" | undefined;
  region?: string | undefined;
  category?: string | undefined;
  freshness?: ContactFreshness | undefined;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/projects/$id/procurement/")({
  validateSearch: (search: Record<string, unknown>): ProcurementSearch => ({
    view: search["view"] === "suppliers" ? "suppliers" : undefined,
    status: str(search["status"]) as ProcurementSearch["status"],
    region: str(search["region"]),
    category: str(search["category"]),
    freshness: str(search["freshness"]) as ContactFreshness | undefined,
  }),
  loader: async ({ params, context }) => {
    const [result] = await Promise.all([
      loadProject(context.queryClient, params.id),
      prefetch(context.queryClient, queries.requests(params.id)),
      prefetch(context.queryClient, queries.suppliers()),
    ]);
    return result;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: `Поставщики и запросы — ${loaderData.project?.name ?? "Объект"} — neeklo FieldOps`,
          },
        ]
      : [],
  }),
  notFoundComponent: ProjectNotFound,
  component: withProject(ProcurementPage),
});

interface RequestRow {
  request: SupplyRequest;
  answered: number;
  bestTotal: number | null;
  due: string | null;
  /** Срок ответа от сервера; null — ответов уже не ждём */
  replyDue: RequestSummary["replyDue"];
  status: RfqStatus;
}

const statusFilters: { id: NonNullable<ProcurementSearch["status"]> | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "open", label: "Ждём ответы" },
  { id: "overdue", label: "Просрочены" },
  { id: "ready", label: "Готовы к сравнению" },
  { id: "decided", label: "Решение принято" },
];

function matchesStatus(row: RequestRow, filter: ProcurementSearch["status"]) {
  if (!filter) return true;
  if (filter === "open")
    return row.status === "collecting" || row.status === "sent" || row.status === "overdue";
  if (filter === "decided") return row.status === "decided" || row.status === "ordered";
  return row.status === filter;
}

function ProcurementPage({ project, overview }: ProjectPageProps): React.JSX.Element {
  const { counterpartyById } = useDirectory();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const view: View = search.view ?? "requests";
  const [createOpen, setCreateOpen] = useState(false);

  const requestsQuery = useQuery(queries.requests(project.id));
  const remind = useRemindSuppliers();
  const suppliersQuery = useQuery(queries.suppliers());
  const summaries = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const profiles = useMemo(
    () => (suppliersQuery.data ?? []).map((item) => item.profile),
    [suppliersQuery.data],
  );
  const setSearch = (patch: Partial<ProcurementSearch>) =>
    navigate({
      search: (prev: ProcurementSearch) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    });

  const requestRows = useMemo<RequestRow[]>(
    () =>
      summaries.map((summary) => ({
        request: summary.request,
        answered: summary.answered,
        bestTotal: summary.bestTotal,
        due: summary.request.replyDueAt,
        replyDue: summary.replyDue,
        status: summary.status,
      })),
    [summaries],
  );

  const supplierRows = useMemo(
    () =>
      profiles.map((profile) => {
        const sent = summaries.filter((r) => r.request.sentTo.includes(profile.supplierId));
        const replied = sent.filter((r) => r.answeredBy.includes(profile.supplierId));
        return {
          profile,
          supplier: counterpartyById(profile.supplierId),
          sent: sent.length,
          replied: replied.length,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, summaries],
  );

  const visibleRequests = requestRows.filter((row) => matchesStatus(row, search.status));
  const visibleSuppliers = supplierRows
    .filter((row) => (search.region ? row.profile.region === search.region : true))
    .filter((row) => (search.category ? row.profile.categories.includes(search.category) : true))
    .filter((row) => (search.freshness ? row.profile.contactStatus === search.freshness : true))
    .sort(
      (a, b) =>
        Number(b.profile.region === overview?.region) -
        Number(a.profile.region === overview?.region),
    );

  const waiting = requestRows.filter(
    (r) => r.answered < r.request.sentTo.length && r.status !== "decided" && r.status !== "ordered",
  );
  const waitingForReminder = waiting.reduce(
    (acc, r) =>
      acc +
      (summaries.find((s) => s.request.id === r.request.id)?.request.sentTo.length ?? 0) -
      (summaries.find((s) => s.request.id === r.request.id)?.answeredBy.length ?? 0) -
      (summaries.find((s) => s.request.id === r.request.id)?.awaiting.length ?? 0),
    0,
  );
  const silentSuppliers = waiting.reduce((acc, r) => acc + r.request.sentTo.length - r.answered, 0);
  const staleContacts = profiles.filter((p) => p.contactStatus !== "verified").length;

  const isRequests = view === "requests";
  const screen = useScreenState({
    pending: requestsQuery.isPending || suppliersQuery.isPending,
    error: requestsQuery.isError || suppliersQuery.isError,
    empty: isRequests ? requestRows.length === 0 : supplierRows.length === 0,
    filtered: isRequests ? visibleRequests.length === 0 : visibleSuppliers.length === 0,
    partial: isRequests ? waiting.length > 0 : staleContacts > 0,
  });
  const blocked = screen === "forbidden" || screen === "error" || screen === "loading";
  const regions = [...new Set(profiles.map((p) => p.region))];
  const categories = [...new Set(profiles.flatMap((p) => p.categories))];
  const resetFilters = () =>
    setSearch({ status: undefined, region: undefined, category: undefined, freshness: undefined });

  return (
    <>
      <SubpageHeader
        project={project}
        title="Поставщики и запросы"
        description={`Кому отправлены запросы, кто ответил и по какой цене. Регион объекта — ${overview?.region ?? "—"}.`}
        actions={
          <Button
            variant="accent"
            className="hidden sm:inline-flex"
            disabled={blocked}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" /> Создать запрос
          </Button>
        }
      />

      <div
        className="segmented-control mb-4 w-full sm:w-auto sm:max-w-max"
        role="tablist"
        aria-label="Вид"
      >
        {(
          [
            { id: "requests", label: "Запросы", count: requestRows.length, icon: PackageSearch },
            { id: "suppliers", label: "Поставщики", count: supplierRows.length, icon: Truck },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() =>
              setSearch({
                view: tab.id === "requests" ? undefined : "suppliers",
                status: undefined,
              })
            }
            className={cn(
              "segment flex min-h-11 flex-1 items-center justify-center gap-2 px-4 text-[13px] lg:min-h-8",
              view === tab.id && "segment-active",
            )}
          >
            <tab.icon className="size-4" /> {tab.label}
            <span className="tnum text-text-muted">{tab.count}</span>
          </button>
        ))}
      </div>

      {screen === "partial" && (
        <StateBanner
          tone="warn"
          className="mb-3"
          title={
            isRequests
              ? `Ответили не все: ${waiting.length} ${plural(waiting.length, "запрос ждёт", "запроса ждут", "запросов ждут")} ответа от ${silentSuppliers || 1} ${plural(silentSuppliers || 1, "поставщика", "поставщиков", "поставщиков")}`
              : `Контакты ${staleContacts} поставщиков не проверены`
          }
          action={
            isRequests ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={waitingForReminder === 0}
                onClick={async () => {
                  const results = await Promise.all(
                    waiting.map((r) => remind.mutateAsync(r.request.id)),
                  );
                  const sent = results.reduce((acc, result) => acc + result.reminded.length, 0);
                  toast.success(
                    `Напоминание отправлено ${sent} ${sent === 1 ? "поставщику" : "поставщикам"}`,
                    {
                      description: "Ответы появятся в сравнении, как только придут.",
                    },
                  );
                }}
              >
                {waitingForReminder === 0 ? "Ждём ответы" : "Напомнить"}
              </Button>
            ) : undefined
          }
        >
          {isRequests
            ? "Сравнение по этим запросам неполное — лучшая цена может измениться."
            : "Письма на устаревший адрес могут не дойти. Позвоните и отметьте контакт проверенным."}
        </StateBanner>
      )}
      {screen === "processing" && (
        <StateBanner tone="info" className="mb-3" title="Распознаём 2 новых письма поставщиков">
          Цены и сроки появятся в сравнении через минуту. Список можно не обновлять.
        </StateBanner>
      )}

      <section className="card-surface overflow-hidden">
        {isRequests ? (
          <div className="-mx-px flex gap-2 overflow-x-auto border-b border-border px-4 py-2.5 [scrollbar-width:none]">
            {statusFilters.map((f) => (
              <FilterChip
                key={f.id}
                className="min-h-11 lg:min-h-9"
                active={(search.status ?? "all") === f.id}
                onClick={() => setSearch({ status: f.id === "all" ? undefined : f.id })}
                count={
                  requestRows.filter((r) => (f.id === "all" ? true : matchesStatus(r, f.id))).length
                }
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 border-b border-border px-4 py-2.5 sm:flex sm:flex-wrap">
            <FilterSelect
              label="Регион"
              allLabel="Все регионы"
              value={search.region}
              options={regions.map((r) => ({ value: r, label: r }))}
              onChange={(region) => setSearch({ region })}
            />
            <FilterSelect
              label="Категория"
              allLabel="Все категории"
              value={search.category}
              options={categories.map((c) => ({ value: c, label: c }))}
              onChange={(category) => setSearch({ category })}
            />
            <FilterSelect
              label="Контакт"
              allLabel="Любая актуальность"
              value={search.freshness}
              options={(Object.keys(contactFreshnessLabel) as ContactFreshness[]).map((k) => ({
                value: k,
                label: contactFreshnessLabel[k],
              }))}
              onChange={(freshness) =>
                setSearch({ freshness: freshness as ContactFreshness | undefined })
              }
            />
          </div>
        )}

        <ScreenGate
          state={screen}
          onRetry={() => void Promise.all([requestsQuery.refetch(), suppliersQuery.refetch()])}
          skeleton={<ScreenSkeleton kind="table" />}
          copy={{
            section: "Поставщики и запросы",
            roles: "руководителю проекта и снабжению",
            errorTitle: isRequests
              ? "Не удалось загрузить запросы"
              : "Не удалось загрузить поставщиков",
            empty: isRequests
              ? {
                  icon: PackageSearch,
                  title: "Запросов поставщикам ещё нет",
                  description:
                    "Выберите проверенные позиции и отправьте запрос: система подберёт поставщиков по категории и региону, а ответы из писем соберёт в сравнение.",
                  actionLabel: "Создать запрос",
                  onAction: () => setCreateOpen(true),
                }
              : {
                  icon: Truck,
                  title: "Поставщиков в справочнике нет",
                  description:
                    "Добавьте поставщиков вручную или импортируйте реестр из Excel — после этого их можно выбирать при создании запроса.",
                },
            filtered: {
              onReset: resetFilters,
              description: "Под условия не попал ни один запрос или поставщик. Сбросьте фильтры.",
            },
          }}
        >
          {isRequests ? (
            <RequestsView rows={visibleRequests} projectId={project.id} />
          ) : (
            <SuppliersView rows={visibleSuppliers} region={overview?.region ?? ""} />
          )}
        </ScreenGate>
      </section>

      {!blocked && (
        <MobileActionBar>
          <Button variant="accent" onClick={() => setCreateOpen(true)}>
            <Send className="size-4" /> Создать запрос
          </Button>
        </MobileActionBar>
      )}

      <CreateRfqDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        project={project}
        region={overview?.region ?? "—"}
        initialIds={[]}
        onCreated={(requestId) =>
          navigate({
            to: "/projects/$id/procurement/$rfqId",
            params: { id: project.id, rfqId: requestId },
          })
        }
      />
    </>
  );
}

function RequestsView({ rows, projectId }: { rows: RequestRow[]; projectId: string }) {
  const { counterpartyById } = useDirectory();
  const navigate = useNavigate();
  const open = (row: RequestRow) =>
    navigate({
      to: "/projects/$id/procurement/$rfqId",
      params: { id: projectId, rfqId: row.request.id },
    });

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-table">
          <thead>
            <tr className="h-10 bg-subtle text-left text-[11px] font-medium whitespace-nowrap text-text-muted">
              <th className="px-4">Номер</th>
              <th className="px-2.5">Дата</th>
              <th className="px-2.5 text-right">Позиций</th>
              <th className="px-2.5">Кому отправлено</th>
              <th className="px-2.5 text-right">Ответили</th>
              <th className="px-2.5 text-right">Лучшая цена</th>
              <th className="px-2.5">Срок ожидания</th>
              <th className="px-4">Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = rfqStatusMeta[row.status];
              return (
                <tr
                  key={row.request.id}
                  tabIndex={0}
                  onClick={() => open(row)}
                  onKeyDown={(e) => e.key === "Enter" && open(row)}
                  className="group h-[60px] cursor-pointer border-b border-border transition-fast last:border-0 hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
                >
                  <td className="px-4">
                    <div className="font-medium text-text-primary group-hover:text-accent">
                      {row.request.number}
                    </div>
                    <div className="max-w-[220px] truncate text-caption text-text-muted">
                      {row.request.items.map((i) => i.name).join(", ")}
                    </div>
                  </td>
                  <td className="tnum px-2.5 whitespace-nowrap text-text-secondary">
                    {fmtDate(row.request.createdAt)}
                  </td>
                  <td className="tnum px-2.5 text-right">{row.request.items.length}</td>
                  <td className="max-w-[240px] px-2.5">
                    <div className="truncate text-text-secondary">
                      {row.request.sentTo.map((id) => counterpartyById(id)?.name).join(", ")}
                    </div>
                  </td>
                  <td className="tnum px-2.5 text-right whitespace-nowrap">
                    <span
                      className={cn(
                        row.answered < row.request.sentTo.length
                          ? "text-warn"
                          : "text-text-primary",
                      )}
                    >
                      {row.answered}
                    </span>
                    <span className="text-text-muted"> из {row.request.sentTo.length}</span>
                  </td>
                  <td className="tnum px-2.5 text-right whitespace-nowrap">
                    {row.bestTotal ? (
                      fmtMoney(row.bestTotal)
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-2.5 whitespace-nowrap">
                    {row.due ? (
                      <>
                        <div className="tnum text-text-secondary">до {fmtDateTime(row.due)}</div>
                        {row.replyDue && (
                          <div
                            className={cn(
                              "text-caption",
                              row.replyDue.overdue ? "text-danger" : "text-text-muted",
                            )}
                          >
                            {fmtReplyDue(row.replyDue)}
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4">
                    <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border lg:hidden">
        {rows.map((row) => {
          const meta = rfqStatusMeta[row.status];
          return (
            <li key={row.request.id}>
              <Link
                to="/projects/$id/procurement/$rfqId"
                params={{ id: projectId, rfqId: row.request.id }}
                className="block px-4 py-3 active:bg-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">{row.request.number}</p>
                    <p className="truncate text-caption text-text-muted">
                      {fmtDate(row.request.createdAt)} · {row.request.items.length} поз. ·{" "}
                      {row.request.items.map((i) => i.name).join(", ")}
                    </p>
                  </div>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-caption">
                  <div>
                    <dt className="text-text-muted">Ответили</dt>
                    <dd className="tnum text-[14px] font-medium">
                      {row.answered} из {row.request.sentTo.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Лучшая цена</dt>
                    <dd className="tnum text-[14px] font-medium">
                      {row.bestTotal ? fmtMoney(row.bestTotal) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Ждём до</dt>
                    <dd
                      className={cn(
                        "tnum text-[14px] font-medium",
                        row.replyDue?.overdue && "text-danger",
                      )}
                    >
                      {row.due ? fmtDate(row.due) : "—"}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SuppliersView({
  rows,
  region,
}: {
  rows: {
    profile: SupplierProfile;
    supplier: Counterparty | null;
    sent: number;
    replied: number;
  }[];
  region: string;
}) {
  const verifyContact = useVerifyContact();
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1180px] text-table">
          <thead>
            <tr className="h-10 bg-subtle text-left text-[11px] font-medium whitespace-nowrap text-text-muted">
              <th className="px-4">Поставщик</th>
              <th className="px-2.5">Регион</th>
              <th className="px-2.5">Категории</th>
              <th className="px-2.5">Контакт</th>
              <th className="px-2.5">Источник контакта</th>
              <th className="px-2.5">Проверен</th>
              <th className="px-2.5">Запрос</th>
              <th className="px-2.5">Ответ</th>
              <th className="px-4 text-right">Среднее время ответа</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ profile, supplier, sent, replied }) => (
              <tr
                key={profile.supplierId}
                className="h-[64px] border-b border-border last:border-0"
              >
                <td className="px-4 font-medium text-text-primary">{supplier?.name}</td>
                <td
                  className={cn(
                    "px-2.5 whitespace-nowrap",
                    profile.region === region ? "text-text-primary" : "text-text-muted",
                  )}
                >
                  {profile.region}
                </td>
                <td className="max-w-[200px] px-2.5">
                  <div className="flex flex-wrap gap-1">
                    {profile.categories.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-text-secondary"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-2.5">
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-text-primary">
                      {profile.contactName}
                    </span>
                    <ContactFreshnessBadge status={profile.contactStatus} />
                  </div>
                  <div className="tnum text-caption text-text-muted">
                    <a
                      href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}
                      className="hover:text-accent"
                    >
                      {profile.phone}
                    </a>{" "}
                    ·{" "}
                    <a href={`mailto:${profile.email}`} className="hover:text-accent">
                      {profile.email}
                    </a>
                  </div>
                </td>
                <td className="max-w-[160px] px-2.5 text-caption text-text-secondary">
                  {profile.contactSource}
                </td>
                <td className="px-2.5 whitespace-nowrap">
                  <div className="tnum text-text-secondary">
                    {fmtDate(profile.contactCheckedAt)}
                  </div>
                  {profile.contactStatus !== "verified" && (
                    <button
                      type="button"
                      onClick={() => verifyContact.mutate(profile.supplierId)}
                      className="text-caption text-accent hover:underline"
                    >
                      Отметить проверенным
                    </button>
                  )}
                </td>
                <td className="px-2.5 whitespace-nowrap">
                  {sent ? (
                    <StatusBadge tone="info">Отправлен · {sent}</StatusBadge>
                  ) : (
                    <span className="text-text-muted">Нет</span>
                  )}
                </td>
                <td className="px-2.5 whitespace-nowrap">
                  {!sent ? (
                    <span className="text-text-muted">—</span>
                  ) : replied ? (
                    <StatusBadge tone="ok">
                      <Check className="size-3" /> {replied} из {sent}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="warn">Нет ответа</StatusBadge>
                  )}
                </td>
                <td className="tnum px-4 text-right">{supplier?.avgReplyHours} ч</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Телефон: контакт — главное, звонок и письмо крупными кнопками */}
      <ul className="divide-y divide-border lg:hidden">
        {rows.map(({ profile, supplier, sent, replied }) => (
          <li key={profile.supplierId} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{supplier?.name}</p>
                <p className="text-caption text-text-muted">
                  {profile.region} · {profile.categories.join(", ")}
                </p>
              </div>
              <span className="tnum shrink-0 text-caption text-text-secondary">
                ~{supplier?.avgReplyHours} ч
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[14px]">{profile.contactName}</span>
              <ContactFreshnessBadge status={profile.contactStatus} />
            </div>
            <p className="mt-0.5 text-caption text-text-muted">
              {profile.contactSource} · проверен {fmtDate(profile.contactCheckedAt)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-caption">
              {sent ? (
                <StatusBadge tone="info">Запрос отправлен</StatusBadge>
              ) : (
                <StatusBadge>Запросов нет</StatusBadge>
              )}
              {sent > 0 &&
                (replied ? (
                  <StatusBadge tone="ok">Ответ получен</StatusBadge>
                ) : (
                  <StatusBadge tone="warn">Нет ответа</StatusBadge>
                ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" asChild>
                <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}>
                  <Phone className="size-4" /> Позвонить
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href={`mailto:${profile.email}`}>
                  <Mail className="size-4" /> Написать
                </a>
              </Button>
              {profile.contactStatus !== "verified" && (
                <Button
                  variant="ghost"
                  className="col-span-2"
                  onClick={() => verifyContact.mutate(profile.supplierId)}
                >
                  <Check className="size-4" /> Контакт актуален
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2 text-caption text-text-muted">
        {fmtNum(rows.length)} поставщиков · сначала регион объекта
      </p>
    </>
  );
}
