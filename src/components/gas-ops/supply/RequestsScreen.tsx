/**
 * «Заявки» снабженца (ADR-057, 4): показатели, таблица по сроку и приоритету, фильтры
 * объекта и статуса. Строка открывает деталь заявки.
 */
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  PRIORITY_LABEL,
  SUPPLY_STATUS_LABEL,
  fmtKop,
  useSupplyBase,
  useSupplyRequests,
  type RequestRow,
  type SupplyStatus,
} from "@/api/gas-supply";
import {
  DataView,
  EmptyState,
  MetricCard,
  MetricRow,
  SegmentedPills,
  SelectSheet,
  StatusChip,
  type DataColumn,
} from "@/components/ui/mono";
import { short, SupplyGate, SUPPLY_TONE } from "./common";

type StatusFilter = SupplyStatus | "all" | "active";

const STATUS_FILTERS = [
  { value: "active", label: "В работе" },
  { value: "new", label: "Новые" },
  { value: "waiting-offers", label: "Ждём предложения" },
  { value: "in-transit", label: "В пути" },
  { value: "all", label: "Все" },
] as const;

const ALL_OBJECTS = "all";

export function RequestsScreen() {
  return (
    <SupplyGate screen="supply">
      <Requests />
    </SupplyGate>
  );
}

function Requests() {
  const base = useSupplyBase();
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("active");
  const [objectId, setObjectId] = useState<string>(ALL_OBJECTS);
  const { rows, metrics, total } = useSupplyRequests({
    objectId: objectId === ALL_OBJECTS ? null : objectId,
    status,
  });

  const columns: DataColumn<RequestRow>[] = [
    {
      key: "number",
      header: "Заявка",
      width: "120px",
      cell: (r) => <span className="font-medium tnum">{r.request.number}</span>,
    },
    { key: "object", header: "Объект", width: "24%", cell: (r) => r.objectLabel },
    {
      key: "lines",
      header: "Позиции",
      cell: (r) => <span className="line-clamp-2">{r.summary}</span>,
    },
    {
      key: "need",
      header: "Нужно к",
      width: "120px",
      cell: (r) => (
        <span className={r.overdue ? "text-down" : undefined}>
          {r.request.needBy ? short(r.request.needBy) : "без срока"}
          {r.overdue ? ", просрочено" : ""}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Приоритет",
      width: "110px",
      cell: (r) => PRIORITY_LABEL[r.request.priority],
    },
    {
      key: "status",
      header: "Статус",
      width: "180px",
      cell: (r) => (
        <StatusChip tone={SUPPLY_TONE[r.request.status]}>
          {SUPPLY_STATUS_LABEL[r.request.status]}
        </StatusChip>
      ),
    },
    {
      key: "sum",
      header: "Сумма заказа",
      width: "130px",
      align: "end",
      cell: (r) => (r.orderKop === null ? "" : <span className="tnum">{fmtKop(r.orderKop)}</span>),
    },
  ];

  return (
    <div className="flex flex-col gap-section">
      <MetricRow label="Заявки">
        <MetricCard label="Новые" value={metrics.fresh} inverse />
        <MetricCard label="Ждут предложений" value={metrics.waitingOffers} />
        <MetricCard label="В пути" value={metrics.inTransit} />
        <MetricCard label="Просрочены к дате" value={metrics.overdue} />
      </MetricRow>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <SegmentedPills
          label="Статус"
          options={STATUS_FILTERS}
          value={status}
          onChange={setStatus}
        />
        <SelectSheet
          label="Объект"
          value={objectId}
          onChange={setObjectId}
          options={[
            { value: ALL_OBJECTS, label: "Все объекты" },
            ...base.objects.map((o) => ({ value: o.id, label: o.code, meta: o.label })),
          ]}
        />
      </div>
      {total === 0 ? (
        <EmptyState
          title="Заявок пока нет"
          text="Заявки создаёт прораб с объекта голосом или текстом."
        />
      ) : (
        <DataView
          label="Заявки снабжения"
          rows={rows}
          rowId={(r) => r.request.id}
          columns={columns}
          title={(r) => `${r.request.number} · ${r.summary}`}
          meta={(r) =>
            `${r.objectLabel} · ${r.request.needBy ? `к ${short(r.request.needBy)}` : "без срока"}${r.overdue ? ", просрочено" : ""}`
          }
          aside={(r) => (
            <StatusChip tone={SUPPLY_TONE[r.request.status]}>
              {SUPPLY_STATUS_LABEL[r.request.status]}
            </StatusChip>
          )}
          onOpen={(id) => {
            if (id) void navigate({ to: "/gas/supply/$requestId", params: { requestId: id } });
          }}
          empty={
            <EmptyState title="Ничего не найдено" text="Смените фильтр статуса или объекта." />
          }
        />
      )}
    </div>
  );
}
