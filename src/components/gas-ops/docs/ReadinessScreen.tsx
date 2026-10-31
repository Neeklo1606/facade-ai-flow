/**
 * Готовность ИД для руководителя (ADR-058): процент комплектности по объектам и блокеры
 * с ответственным. Тот же блок стоит в «Неделе».
 */
import { useReadiness, type ObjectReadiness } from "@/api/gas-docs";
import { Card, EmptyState, StatusChip } from "@/components/ui/mono";
import { DocsGate } from "./common";

export function ReadinessScreen() {
  return (
    <DocsGate screen="docsOverview">
      <DocsReadiness />
    </DocsGate>
  );
}

export function DocsReadiness() {
  const list = useReadiness();
  if (list.length === 0) {
    return (
      <EmptyState
        title="Работ для актов нет"
        text="Готовность появится, когда по объектам будут записи объёмов."
      />
    );
  }
  return (
    <ul
      aria-label="Готовность ИД по объектам"
      className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2"
    >
      {list.map((r) => (
        <li key={r.objectId}>
          <ObjectCard readiness={r} />
        </li>
      ))}
    </ul>
  );
}

function ObjectCard({ readiness: r }: { readiness: ObjectReadiness }) {
  return (
    <Card
      as="article"
      title={r.objectLabel}
      action={<StatusChip tone={r.percent === 100 ? "up" : "caution"}>{r.percent}%</StatusChip>}
    >
      <div className="flex flex-col gap-3">
        <div
          role="progressbar"
          aria-label={`Комплектность ИД: ${r.objectLabel}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={r.percent}
          className="h-2.5 overflow-hidden rounded-pill bg-panel-3"
        >
          <div className="h-full rounded-pill bg-ink" style={{ width: `${r.percent}%` }} />
        </div>
        <p className="type-small text-ink-3">
          Работ: {r.works} · подписано актов: {r.signed} · демо-данные
        </p>
        {r.blockers.length ? (
          <ul aria-label={`Блокеры: ${r.objectLabel}`} className="flex flex-col gap-2">
            {r.blockers.map((b, i) => (
              <li
                key={`${b.code}-${i}`}
                className="flex flex-wrap items-start justify-between gap-2 type-small"
              >
                <span className="text-ink-2">
                  {b.workNumber}: {b.text}
                </span>
                <span className="text-ink-3">{b.owner}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-small text-ink-2">Блокеров нет.</p>
        )}
      </div>
    </Card>
  );
}
