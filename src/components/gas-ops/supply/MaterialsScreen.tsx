/**
 * «Материалы» ПТО (ADR-057, связь с модулем 3): принятые на объектах материалы
 * с сертификатами и паспортами. Без сертификата материал помечен: в акт его не включить.
 */
import { Link } from "@tanstack/react-router";
import {
  RECEIPT_RESULT_LABEL,
  fmtQty,
  useAcceptedMaterials,
  useSupplyBase,
} from "@/api/gas-supply";
import { Card, EmptyState, StatusChip } from "@/components/ui/mono";
import { short, SupplyGate } from "./common";

export function MaterialsScreen() {
  return (
    <SupplyGate screen="materials">
      <Materials />
    </SupplyGate>
  );
}

function Materials() {
  const materials = useAcceptedMaterials();
  const base = useSupplyBase();
  if (materials.length === 0) {
    return (
      <EmptyState
        title="Принятых материалов нет"
        text="Материал появится здесь, когда прораб примет поставку на объекте."
      />
    );
  }
  const byObject = new Map<string, typeof materials>();
  for (const m of materials) byObject.set(m.objectId, [...(byObject.get(m.objectId) ?? []), m]);
  return (
    <div className="flex flex-col gap-section">
      {[...byObject.entries()].map(([objectId, list]) => (
        <Card key={objectId} title={base.objectLabel(objectId)}>
          <ul
            aria-label={`Материалы: ${base.objectLabel(objectId)}`}
            className="flex flex-col divide-y divide-line"
          >
            {list.map((m) => (
              <li key={m.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="type-text font-medium">{base.itemName(m.itemId)}</span>
                  <span className="type-text tnum">
                    {fmtQty(m.qty)} {base.itemUnit(m.itemId)}
                  </span>
                </div>
                <p className="flex flex-wrap items-center gap-2 type-small text-ink-3">
                  <Link
                    to="/gas/supply/$requestId"
                    params={{ requestId: m.requestId }}
                    className="focus-ring rounded-tile underline-offset-4 is-hover:underline"
                  >
                    {m.requestNumber}
                  </Link>
                  · принято {short(m.at)} · {RECEIPT_RESULT_LABEL[m.result]}
                </p>
                {m.certificates.length ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <StatusChip tone="up">Сертификат есть</StatusChip>
                    <span className="type-small text-ink-2">{m.certificates.join(", ")}</span>
                  </p>
                ) : (
                  <p>
                    <StatusChip tone="caution">Нет сертификата</StatusChip>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
