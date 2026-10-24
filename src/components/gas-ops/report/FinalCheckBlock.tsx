import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/kit/status";
import { notify } from "@/components/ui/kit/toast";
import { fmtRub, useGasActor, useGasDirectory } from "@/api/gas-ops";
import { useGasEstimateActions, useGasReviewPolicy } from "@/api/gas-estimates";
import { toast } from "@/lib/toast";

/**
 * Итоговая проверка и сдача отчёта (ADR-053, 5). Сдача отчёта — финансовая операция:
 * записи, подтверждённые без человека (режимы «только с замечаниями» и «без проверки»),
 * человек просматривает одним списком и подтверждает одним действием с записью в журнал.
 * Сданный отчёт молча не меняется: после новой версии сметы он помечается «Требует обновления».
 */
export function FinalCheckBlock() {
  const policy = useGasReviewPolicy();
  const actions = useGasEstimateActions();
  const directory = useGasDirectory();
  const [busy, setBusy] = useState(false);
  const actor = useGasActor();
  // Проверку проводит и отчёт сдаёт менеджер; руководитель видит состояние
  const canAct = actor.role === "manager" || actor.role === "admin";
  const left = policy.finalList.length;
  const last = policy.reports[0] ?? null;
  const label = (objectId: string) =>
    directory.objects.find((o) => o.id === objectId)?.label ?? objectId;

  const check = async () => {
    setBusy(true);
    const result = await actions.finalCheck();
    setBusy(false);
    if (!result.ok) toast.error(result.message);
    else notify(`Итоговая проверка: подтверждено записей ${result.value.entryIds.length}`);
  };

  const issue = async () => {
    setBusy(true);
    const result = await actions.issueReport();
    setBusy(false);
    if (!result.ok) toast.error(result.message);
    else notify(`Отчёт недели сдан: ${fmtRub(result.value.totalRub)}`);
  };

  return (
    <section
      aria-labelledby="final-check"
      className="surface-1 flex flex-col gap-block p-card"
      data-testid="final-check"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-control bg-panel-2 text-ink-2"
        >
          <ShieldCheck className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="final-check" className="text-heading">
            Итоговая проверка перед сдачей
          </h2>
          <p className="text-meta text-text-3">
            {left > 0
              ? `Без ручного подтверждения: ${left}. Просмотрите и подтвердите перед выгрузкой и сдачей.`
              : policy.lastCheck
                ? `Последняя проверка: ${policy.lastCheck.by}, ${policy.lastCheck.at.replace("T", " ").slice(5, 16)}, записей ${policy.lastCheck.count}.`
                : "Все записи недели подтвердил человек: итоговая проверка не нужна."}
          </p>
        </div>
      </div>

      {left > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {policy.finalList.slice(0, 6).map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-body">{label(entry.objectId)}</span>
                <span className="block text-meta text-text-3 tnum">
                  {entry.number} · {entry.day.slice(8, 10)}.{entry.day.slice(5, 7)} · подтверждена
                  автоматически
                </span>
              </span>
              <span className="shrink-0 text-body-strong tnum">
                {entry.amountRub === null ? "нет суммы" : fmtRub(entry.amountRub)}
              </span>
            </li>
          ))}
          {left > 6 ? <li className="py-2 text-meta text-text-3">И ещё {left - 6}</li> : null}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!canAct ? null : left > 0 ? (
          <Button
            variant="primary"
            size="field"
            loading={busy}
            loadingText="Подтверждаю..."
            onClick={() => void check()}
          >
            Проверил, подтвердить {left}
          </Button>
        ) : (
          <Button
            variant="secondary"
            loading={busy}
            loadingText="Сдаю..."
            onClick={() => void issue()}
          >
            Сдать отчёт недели
          </Button>
        )}
        {last ? (
          <span className="inline-flex flex-wrap items-center gap-2 text-meta text-text-3">
            Сдан {last.issuedAt.replace("T", " ").slice(5, 16)}, {fmtRub(last.totalRub)}
            {last.stale ? <Chip tone="decide">Требует обновления</Chip> : null}
          </span>
        ) : null}
      </div>
      {last?.stale && last.staleReason ? (
        <p className="text-meta text-warn">{last.staleReason}. Сдайте отчёт заново.</p>
      ) : null}
    </section>
  );
}

/** Норма сметы против факта бригад по объектам с подтверждённой сметой (ADR-053, 3) */
export function NormVsFactBlock({ rows }: { rows: { id: string; label: string; text: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="norm-fact" className="surface-1 flex flex-col gap-2 p-card">
      <h2 id="norm-fact" className="text-heading">
        Норма сметы и факт бригад
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate text-body">{row.label}</span>
            <span className="shrink-0 text-meta text-text-2 tnum">{row.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
