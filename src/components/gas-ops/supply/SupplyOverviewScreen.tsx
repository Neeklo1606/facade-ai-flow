/**
 * «Снабжение» руководителя (ADR-057, 4): сумма заказов по выбранным предложениям,
 * просрочки к дате и превышения сметы. Блок «Снабжение» в «Неделе» — та же сводка.
 */
import { Link } from "@tanstack/react-router";
import {
  SUPPLY_STATUS_LABEL,
  fmtKop,
  fmtQty,
  useSupplyBase,
  useSupplyOverview,
} from "@/api/gas-supply";
import { Card, EmptyState, MetricCard, MetricRow, StatusChip } from "@/components/ui/mono";
import { short, SupplyGate, SUPPLY_TONE } from "./common";

export function SupplyOverviewScreen() {
  return (
    <SupplyGate screen="supplyOverview">
      <Overview />
    </SupplyGate>
  );
}

/** Показатели сводки: на этом экране и в «Неделе» */
export function SupplyMetrics() {
  const overview = useSupplyOverview();
  return (
    <MetricRow label="Снабжение">
      <MetricCard
        label="Сумма заказов"
        value={overview.orderedCount ? overview.orderedKop : null}
        text={overview.orderedCount ? fmtKop(overview.orderedKop) : "Заказов нет"}
        note={
          overview.unpricedCount
            ? `без суммы: ${overview.unpricedCount}`
            : `заказов: ${overview.orderedCount}`
        }
        inverse
      />
      <MetricCard label="Просрочено к дате" value={overview.overdue.length} />
      <MetricCard label="Превышения сметы" value={overview.overLimit.length} />
      <MetricCard label="Заказано заявок" value={overview.orderedCount} />
    </MetricRow>
  );
}

function Overview() {
  const overview = useSupplyOverview();
  const base = useSupplyBase();
  return (
    <div className="flex flex-col gap-section">
      <SupplyMetrics />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-section lg:grid-cols-2">
        <Card title="Просрочено к дате">
          {overview.overdue.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {overview.overdue.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/gas/supply/$requestId"
                    params={{ requestId: r.id }}
                    className="mono-row focus-ring -mx-4 justify-between rounded-tile"
                  >
                    <span className="min-w-0">
                      <span className="block type-text font-medium">{r.number}</span>
                      <span className="block truncate type-small text-ink-3">
                        {base.objectLabel(r.objectId)} · нужно к {short(r.needBy)}
                      </span>
                    </span>
                    <StatusChip tone={SUPPLY_TONE[r.status]}>
                      {SUPPLY_STATUS_LABEL[r.status]}
                    </StatusChip>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Просрочек нет" text="Все заявки в срок или без срока." />
          )}
        </Card>
        <Card title="Превышения сметы">
          {overview.overLimit.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {overview.overLimit.map((o) => (
                <li key={`${o.requestId}-${o.itemId}`}>
                  <Link
                    to="/gas/supply/$requestId"
                    params={{ requestId: o.requestId }}
                    className="mono-row focus-ring -mx-4 justify-between rounded-tile"
                  >
                    <span className="min-w-0">
                      <span className="block type-text font-medium">
                        {o.number} · {base.itemName(o.itemId)}
                      </span>
                      <span className="block truncate type-small text-ink-3">
                        {base.objectLabel(o.objectId)}
                      </span>
                    </span>
                    <span className="shrink-0 type-text text-down tnum">
                      +{fmtQty(o.over)} {base.itemUnit(o.itemId)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Превышений нет"
              text="Лимит сметы задан не у всех объектов: где его нет, сверка не делается."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
