import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { FilterBar, FilterChip } from "@/components/common/FilterBar";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityDrawer } from "@/components/common/EntityDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, type Tone } from "@/components/common/StatusBadge";
import { SourceRef, SourceDrawer } from "@/components/common/SourceRef";
import { Button } from "@/components/ui/button";
import { counterpartyById, deliveries, supplyRequests, type Delivery } from "@/mock/repository";
import { projectName, useProjectId } from "@/lib/project-scope";
import { fmtDate, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/deliveries")({
  head: () => ({
    meta: [
      { title: "Поставки — neeklo FieldOps" },
      {
        name: "description",
        content: "Ожидаемые и принятые партии материалов: связь с запросом, поставщиком и объектом.",
      },
      { property: "og:title", content: "Поставки — neeklo FieldOps" },
      { property: "og:description", content: "Ожидаемые и принятые партии, входной контроль." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeliveriesPage,
});

const statusMeta: Record<string, { label: string; tone: Tone }> = {
  expected: { label: "Ожидается", tone: "neutral" },
  in_transit: { label: "В пути", tone: "info" },
  received: { label: "Принята", tone: "ok" },
  rejected: { label: "Отклонена", tone: "danger" },
};

function meta(status: string) {
  return statusMeta[status] ?? { label: status, tone: "neutral" as Tone };
}

const filters = [
  { id: "all", label: "Все" },
  { id: "expected", label: "Ожидаются" },
  { id: "in_transit", label: "В пути" },
  { id: "received", label: "Принятые" },
];

function DeliveriesPage() {
  const projectId = useProjectId();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<Delivery | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);

  const scoped = useMemo(
    () => deliveries.filter((item) => (projectId ? item.projectId === projectId : true)),
    [projectId],
  );
  const rows = useMemo(
    () =>
      scoped
        .filter((item) => (filter === "all" ? true : item.status === filter))
        .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt)),
    [scoped, filter],
  );

  const columns: Column<Delivery>[] = [
    {
      key: "supplier",
      header: "Поставщик",
      primary: true,
      cell: (row) => counterpartyById(row.supplierId)?.name ?? row.supplierId,
    },
    { key: "project", header: "Объект", cell: (row) => projectName(row.projectId) },
    {
      key: "request",
      header: "Запрос",
      cell: (row) => supplyRequests.find((item) => item.id === row.requestId)?.number ?? "—",
    },
    {
      key: "items",
      header: "Позиции",
      className: "max-w-[280px] truncate",
      cell: (row) => row.items.map((item) => `${item.name} — ${fmtNum(item.qty)} ${item.unit}`).join("; "),
    },
    { key: "expected", header: "Ожидается", cell: (row) => fmtDate(row.expectedAt) },
    { key: "received", header: "Принята", cell: (row) => (row.receivedAt ? fmtDate(row.receivedAt) : "—") },
    {
      key: "status",
      header: "Состояние",
      cell: (row) => <StatusBadge tone={meta(row.status).tone}>{meta(row.status).label}</StatusBadge>,
    },
    {
      key: "source",
      header: "Источник",
      hideOnCard: true,
      cell: (row) => <SourceRef sourceId={row.sourceId} onOpen={() => setSourceId(row.sourceId)} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Поставки"
        description="Партии по зафиксированным решениям: что и когда приходит на объект, откуда взят срок."
        actions={
          <Button size="sm">
            <PackageCheck className="size-4" /> Принять поставку
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
              count={item.id === "all" ? scoped.length : scoped.filter((d) => d.status === item.id).length}
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
              icon={PackageCheck}
              title="Поставок по условию нет"
              description="Смените состояние или выберите другой объект в шапке."
            />
          }
        />
      </Panel>

      {open && (
        <EntityDrawer
          open
          onOpenChange={(v) => !v && setOpen(null)}
          title={counterpartyById(open.supplierId)?.name ?? "Поставка"}
          subtitle={`${projectName(open.projectId)} · запрос ${
            supplyRequests.find((item) => item.id === open.requestId)?.number ?? "—"
          }`}
          badges={<StatusBadge tone={meta(open.status).tone}>{meta(open.status).label}</StatusBadge>}
        >
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[12px] text-text-muted">Ожидается</dt>
                <dd>{fmtDate(open.expectedAt)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-muted">Принята</dt>
                <dd>{open.receivedAt ? fmtDate(open.receivedAt) : "—"}</dd>
              </div>
            </dl>
            <section>
              <p className="text-[12px] text-text-muted">Позиции партии</p>
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
            {open.sourceId && (
              <section className="flex items-center gap-2">
                <SourceRef sourceId={open.sourceId} onOpen={() => setSourceId(open.sourceId)} />
                <span className="text-[12px] text-text-secondary">Срок поставки подтверждён письмом поставщика</span>
              </section>
            )}
          </div>
        </EntityDrawer>
      )}

      {sourceId && <SourceDrawer sourceId={sourceId} onOpenChange={() => setSourceId(null)} />}
    </>
  );
}
