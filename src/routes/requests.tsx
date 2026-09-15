import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PackageSearch, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { FilterBar, FilterChip } from "@/components/common/FilterBar";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityDrawer } from "@/components/common/EntityDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, type Tone } from "@/components/common/StatusBadge";
import { SourceRef, SourceDrawer } from "@/components/common/SourceRef";
import { Button } from "@/components/ui/button";
import {
  counterpartyById,
  employeeById,
  offersFor,
  supplyRequests,
  type SupplyRequest,
} from "@/mock/repository";
import { projectName, useProjectId } from "@/lib/project-scope";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/requests")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search['status'] === "string" ? (search['status'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Запросы поставщикам — neeklo FieldOps" },
      {
        name: "description",
        content: "Заявка на закупку: позиции из спецификации, рассылка поставщикам и контроль ответов.",
      },
      { property: "og:title", content: "Запросы поставщикам — neeklo FieldOps" },
      { property: "og:description", content: "Заявка на закупку: от потребности до рассылки поставщикам." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RequestsPage,
});

const statusMeta: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Черновик", tone: "neutral" },
  sent: { label: "Отправлен", tone: "info" },
  collecting: { label: "Ждём ответы", tone: "warn" },
  compared: { label: "Есть сравнение", tone: "ok" },
  ordered: { label: "Заказано", tone: "ok" },
};

const filters = [
  { id: "all", label: "Все" },
  { id: "sent", label: "Отправленные" },
  { id: "collecting", label: "Ждут ответа" },
  { id: "compared", label: "Готовы к решению" },
  { id: "ordered", label: "Заказанные" },
];

function RequestsPage() {
  const projectId = useProjectId();
  const search = Route.useSearch();
  const [filter, setFilter] = useState(search.status ?? "all");
  const [open, setOpen] = useState<SupplyRequest | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);

  const scoped = useMemo(
    () => supplyRequests.filter((item) => (projectId ? item.projectId === projectId : true)),
    [projectId],
  );
  const rows = useMemo(
    () =>
      scoped
        .filter((item) => (filter === "all" ? true : item.status === filter))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [scoped, filter],
  );

  const columns: Column<SupplyRequest>[] = [
    { key: "number", header: "Запрос", primary: true, cell: (row) => row.number },
    { key: "project", header: "Объект", cell: (row) => projectName(row.projectId) },
    {
      key: "items",
      header: "Позиции",
      cell: (row) => `${row.items.length} поз. · ${row.items.map((i) => i.name).join(", ")}`,
      className: "max-w-[320px] truncate",
    },
    { key: "sent", header: "Поставщиков", className: "tnum", cell: (row) => fmtNum(row.sentTo.length) },
    {
      key: "offers",
      header: "Предложений",
      className: "tnum",
      cell: (row) => {
        const offers = offersFor(row.id);
        return offers.length ? fmtNum(offers.length) : "—";
      },
    },
    {
      key: "best",
      header: "Лучшая цена",
      className: "tnum",
      cell: (row) => {
        const offers = offersFor(row.id);
        return offers[0] ? fmtMoney(offers[0].total) : "—";
      },
    },
    { key: "created", header: "Создан", cell: (row) => fmtDate(row.createdAt) },
    {
      key: "status",
      header: "Состояние",
      cell: (row) => <StatusBadge tone={statusMeta[row.status]?.tone}>{statusMeta[row.status]?.label}</StatusBadge>,
    },
    {
      key: "source",
      header: "Источник",
      hideOnCard: true,
      cell: (row) => <SourceRef sourceId={row.sourceId} onOpen={() => setSourceId(row.sourceId)} />,
    },
  ];

  const openOffers = open ? offersFor(open.id) : [];

  return (
    <>
      <PageHeader
        title="Запросы поставщикам"
        description="Позиции берутся из подтверждённой спецификации или из дефицита, заявленного с площадки. Ответы собираются на экране предложений."
        actions={
          <Button size="sm">
            <Plus className="size-4" /> Создать запрос
          </Button>
        }
      />

      <Panel bodyClassName="p-0">
        <FilterBar right={<span className="text-caption text-text-muted">Записей: {rows.length}</span>}>
          {filters.map((item) => (
            <FilterChip
              key={item.id}
              active={filter === item.id}
              onClick={() => setFilter(item.id)}
              count={item.id === "all" ? scoped.length : scoped.filter((r) => r.status === item.id).length}
            >
              {item.label}
            </FilterChip>
          ))}
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(row) => setOpen(row)}
          empty={
            <EmptyState
              icon={PackageSearch}
              title="Запросов по условию нет"
              description="Смените состояние или выберите другой объект в шапке."
            />
          }
        />
      </Panel>

      {open && (
        <EntityDrawer
          open
          onOpenChange={(v) => !v && setOpen(null)}
          title={`Запрос ${open.number}`}
          subtitle={`${projectName(open.projectId)} · создал ${employeeById(open.authorId)?.name ?? "—"} · ${fmtDate(open.createdAt)}`}
          badges={<StatusBadge tone={statusMeta[open.status]?.tone}>{statusMeta[open.status]?.label}</StatusBadge>}
          footer={
            <Button size="sm" asChild>
              <Link to="/quotes" search={{ request: open.id }}>
                Перейти к сравнению предложений
              </Link>
            </Button>
          }
        >
          <div className="space-y-5">
            <section>
              <p className="text-[12px] text-text-muted">Позиции запроса</p>
              <ul className="mt-2 divide-y divide-border rounded-[var(--r-md)] border border-border">
                {open.items.map((item) => (
                  <li key={item.materialId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="min-w-0 truncate text-[13px]">{item.name}</span>
                    <span className="tnum shrink-0 text-[13px] text-text-secondary">
                      {fmtNum(item.qty)} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="text-[12px] text-text-muted">Кому отправлен</p>
              <ul className="mt-2 space-y-2">
                {open.sentTo.map((id) => {
                  const supplier = counterpartyById(id);
                  const offer = openOffers.find((item) => item.supplierId === id);
                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-3 rounded-[var(--r-md)] border border-border px-3 py-2.5"
                    >
                      <span className="min-w-0 truncate text-[13px]">{supplier?.name ?? id}</span>
                      {offer ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tnum text-[13px]">{fmtMoney(offer.total)}</span>
                          <SourceRef sourceId={offer.sourceId} onOpen={() => setSourceId(offer.sourceId)} />
                        </span>
                      ) : (
                        <StatusBadge tone="warn">Ответа нет</StatusBadge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </EntityDrawer>
      )}

      {sourceId && <SourceDrawer sourceId={sourceId} onOpenChange={() => setSourceId(null)} />}
    </>
  );
}
