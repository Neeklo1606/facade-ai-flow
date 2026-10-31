/**
 * «Поставки» (ADR-057, 4): что в пути и к какой дате, что уже принято на объекте
 * и с какими расхождениями.
 */
import { useNavigate } from "@tanstack/react-router";
import { SUPPLY_STATUS_LABEL, useSupplyRequests, type RequestRow } from "@/api/gas-supply";
import { Card, DataView, EmptyState, StatusChip, type DataColumn } from "@/components/ui/mono";
import { short, SupplyGate, SUPPLY_TONE } from "./common";

const MOVING = new Set(["ordered", "in-transit", "partial"]);
const DONE = new Set(["delivered", "closed"]);

export function DeliveriesScreen() {
  return (
    <SupplyGate screen="deliveries">
      <Deliveries />
    </SupplyGate>
  );
}

function Deliveries() {
  const navigate = useNavigate();
  const { rows } = useSupplyRequests({ objectId: null, status: "all" });
  const moving = rows.filter((r) => MOVING.has(r.request.status));
  const done = rows.filter((r) => DONE.has(r.request.status));
  const columns: DataColumn<RequestRow>[] = [
    { key: "n", header: "Заявка", width: "120px", cell: (r) => r.request.number },
    { key: "o", header: "Объект", width: "26%", cell: (r) => r.objectLabel },
    { key: "l", header: "Позиции", cell: (r) => <span className="line-clamp-2">{r.summary}</span> },
    {
      key: "eta",
      header: "Ожидается",
      width: "120px",
      cell: (r) => (r.request.eta ? short(r.request.eta) : "дата не назначена"),
    },
    {
      key: "s",
      header: "Статус",
      width: "190px",
      cell: (r) => (
        <StatusChip tone={SUPPLY_TONE[r.request.status]}>
          {SUPPLY_STATUS_LABEL[r.request.status]}
        </StatusChip>
      ),
    },
  ];
  const open = (id: string | null) => {
    if (id) void navigate({ to: "/gas/supply/$requestId", params: { requestId: id } });
  };
  const view = (list: RequestRow[], label: string) => (
    <DataView
      label={label}
      rows={list}
      rowId={(r) => r.request.id}
      columns={columns}
      title={(r) => `${r.request.number} · ${r.summary}`}
      meta={(r) =>
        `${r.objectLabel} · ${r.request.eta ? `ожидается ${short(r.request.eta)}` : "дата не назначена"}`
      }
      aside={(r) => (
        <StatusChip tone={SUPPLY_TONE[r.request.status]}>
          {SUPPLY_STATUS_LABEL[r.request.status]}
        </StatusChip>
      )}
      onOpen={open}
    />
  );
  return (
    <div className="flex flex-col gap-section">
      <Card title={`В пути и заказано: ${moving.length}`}>
        {moving.length ? (
          view(moving, "Поставки в пути")
        ) : (
          <EmptyState title="Ничего не едет" text="Заказанные заявки появятся здесь." />
        )}
      </Card>
      <Card title={`Доставлено: ${done.length}`}>
        {done.length ? (
          view(done, "Принятые поставки")
        ) : (
          <EmptyState title="Принятых поставок нет" text="Приёмку на объекте делает прораб." />
        )}
      </Card>
    </div>
  );
}
