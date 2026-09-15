import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Truck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { FilterBar, FilterChip } from "@/components/common/FilterBar";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityDrawer } from "@/components/common/EntityDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SourceRef, SourceDrawer } from "@/components/common/SourceRef";
import { Button } from "@/components/ui/button";
import {
  counterparties,
  materialById,
  supplierOffers,
  supplyRequests,
  type Counterparty,
} from "@/mock/repository";
import { fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Поставщики — neeklo FieldOps" },
      {
        name: "description",
        content: "Реестр поставщиков: скорость ответа, сроки поставки, полученные предложения и письма-первоисточники.",
      },
      { property: "og:title", content: "Поставщики — neeklo FieldOps" },
      { property: "og:description", content: "Реестр поставщиков с историей предложений и сроками." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuppliersPage,
});

function supplierStats(supplierId: string) {
  const offers = supplierOffers.filter((item) => item.supplierId === supplierId);
  const requestsSent = supplyRequests.filter((item) => item.sentTo.includes(supplierId));
  const categories = new Set<string>();
  for (const offer of offers) {
    for (const price of offer.prices) {
      const material = materialById(price.materialId);
      if (material) categories.add(material.category);
    }
  }
  const leadAvg = offers.length
    ? Math.round(offers.reduce((acc, item) => acc + item.leadTimeDays, 0) / offers.length)
    : null;
  return {
    offers,
    requestsCount: requestsSent.length,
    offersCount: offers.length,
    leadAvg,
    categories: [...categories],
    bestCount: offers.filter((item) => item.best).length,
  };
}

function SuppliersPage() {
  const [onlyReplied, setOnlyReplied] = useState(false);
  const [open, setOpen] = useState<Counterparty | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);

  const suppliers = useMemo(() => counterparties.filter((item) => item.role === "supplier"), []);
  const rows = useMemo(
    () => suppliers.filter((item) => (onlyReplied ? supplierStats(item.id).offersCount > 0 : true)),
    [suppliers, onlyReplied],
  );

  const columns: Column<Counterparty>[] = [
    { key: "name", header: "Поставщик", primary: true, cell: (row) => row.name },
    {
      key: "categories",
      header: "Номенклатура",
      cell: (row) => {
        const list = supplierStats(row.id).categories;
        return list.length ? list.join(", ") : "—";
      },
    },
    { key: "contact", header: "Контакт", cell: (row) => `${row.contactName} · ${row.phone}` },
    { key: "reply", header: "Ответ, ч", className: "tnum", cell: (row) => fmtNum(row.avgReplyHours) },
    {
      key: "lead",
      header: "Срок поставки",
      className: "tnum",
      cell: (row) => {
        const lead = supplierStats(row.id).leadAvg;
        return lead ? `${lead} дн.` : "—";
      },
    },
    {
      key: "requests",
      header: "Запросов / предложений",
      className: "tnum",
      cell: (row) => {
        const stats = supplierStats(row.id);
        return `${stats.requestsCount} / ${stats.offersCount}`;
      },
    },
    {
      key: "rating",
      header: "Оценка",
      cell: (row) => (
        <StatusBadge tone={row.rating >= 4.5 ? "ok" : row.rating >= 4 ? "warn" : "danger"}>
          {row.rating.toFixed(1)}
        </StatusBadge>
      ),
    },
  ];

  const stats = open ? supplierStats(open.id) : null;

  return (
    <>
      <PageHeader
        title="Поставщики"
        description="Кому отправляем запросы и как они отвечают. Срок и цена берутся из писем, письмо открывается по значку источника."
        actions={
          <Button size="sm">
            <Plus className="size-4" /> Добавить поставщика
          </Button>
        }
      />

      <Panel bodyClassName="p-0">
        <FilterBar right={<span className="text-caption text-text-muted">Записей: {rows.length}</span>}>
          <FilterChip active={!onlyReplied} onClick={() => setOnlyReplied(false)} count={suppliers.length}>
            Все поставщики
          </FilterChip>
          <FilterChip
            active={onlyReplied}
            onClick={() => setOnlyReplied(true)}
            count={suppliers.filter((item) => supplierStats(item.id).offersCount > 0).length}
          >
            С полученными предложениями
          </FilterChip>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(row) => setOpen(row)}
          empty={
            <EmptyState
              icon={Truck}
              title="Поставщиков по условию нет"
              description="Снимите отбор, чтобы увидеть весь реестр."
            />
          }
        />
      </Panel>

      {open && stats && (
        <EntityDrawer
          open
          onOpenChange={(v) => !v && setOpen(null)}
          title={open.name}
          subtitle={`${open.contactName} · ${open.email}`}
          badges={
            <>
              <StatusBadge tone={open.rating >= 4.5 ? "ok" : "warn"}>Оценка {open.rating.toFixed(1)}</StatusBadge>
              <StatusBadge tone="neutral">Ответ за {open.avgReplyHours} ч</StatusBadge>
            </>
          }
          footer={
            <Button size="sm" asChild>
              <Link to="/requests">Отправить запрос</Link>
            </Button>
          }
        >
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[12px] text-text-muted">ИНН</dt>
                <dd className="tnum">{open.inn}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-muted">Телефон</dt>
                <dd>{open.phone}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-muted">Запросов отправлено</dt>
                <dd className="tnum">{stats.requestsCount}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-muted">Выбран как лучший</dt>
                <dd className="tnum">{stats.bestCount}</dd>
              </div>
            </dl>

            {stats.offers.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Предложений пока нет"
                description="Поставщик ещё не прислал ответ ни по одному запросу."
              />
            ) : (
              <section>
                <p className="text-[12px] text-text-muted">Полученные предложения</p>
                <ul className="mt-2 divide-y divide-border rounded-[var(--r-md)] border border-border">
                  {stats.offers.map((offer) => {
                    const request = supplyRequests.find((item) => item.id === offer.requestId);
                    return (
                      <li key={offer.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">Запрос {request?.number ?? offer.requestId}</p>
                          <p className="text-[12px] text-text-muted">
                            {fmtDateTime(offer.receivedAt)} · срок {offer.leadTimeDays} дн.
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tnum text-[13px] font-medium">{fmtMoney(offer.total)}</span>
                          <SourceRef sourceId={offer.sourceId} onOpen={() => setSourceId(offer.sourceId)} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </EntityDrawer>
      )}

      {sourceId && <SourceDrawer sourceId={sourceId} onOpenChange={() => setSourceId(null)} />}
    </>
  );
}
