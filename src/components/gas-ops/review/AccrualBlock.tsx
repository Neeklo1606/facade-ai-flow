/**
 * «Доля и начисление» в детали записи (ADR-078): раздел, доля было → предложено, сумма шага
 * и остаток раздела. Оксана принимает предложенную долю как есть, меняет число или ставит
 * «Раздел завершён». Без норматива — ручное начисление с причиной. Сумма пересчитывается сразу.
 */
import { useId } from "react";
import { fmtShare, type AccrualDecision, type AccrualPreview } from "@/api/gas-section-accrual";
import { fmtRub } from "@/api/gas-ops";
import { cn } from "@/lib/utils";

export interface AccrualDraft {
  percent: string;
  done: boolean;
  manual: boolean;
  manualRub: string;
  reason: string;
}

export const emptyAccrualDraft = (): AccrualDraft => ({
  percent: "",
  done: false,
  manual: false,
  manualRub: "",
  reason: "",
});

/** Решение для порта из полей блока */
export function decisionOf(draft: AccrualDraft): AccrualDecision {
  if (draft.manual)
    return {
      kind: "manual",
      amountRub: Number(draft.manualRub.replace(/\s/g, "").replace(",", ".")),
      reason: draft.reason,
    };
  return {
    kind: "share",
    percent: draft.percent.trim() === "" ? null : draft.percent,
    done: draft.done,
  };
}

export function AccrualBlock({
  preview,
  draft,
  onChange,
  decided,
  decidedAccrual,
}: {
  preview: AccrualPreview;
  draft: AccrualDraft;
  onChange: (next: AccrualDraft) => void;
  /** Запись уже принята: блок показывает начисление, поля закрыты */
  decided: boolean;
  decidedAccrual: { fromBp: number; toBp: number; rub: number; reason: string | null } | null;
}) {
  const percentId = useId();
  const manualId = useId();
  const reasonId = useId();
  const result = preview.amountFor(decisionOf(draft));
  const noNorm = preview.suggestedBp === null;
  const set = (patch: Partial<AccrualDraft>) => onChange({ ...draft, ...patch });

  return (
    <section
      aria-label="Доля и начисление"
      data-testid="accrual-block"
      className="mt-3 rounded-card border border-line bg-surface-2 p-3"
    >
      <h3 className="text-body-strong">Доля и начисление</h3>
      <p className="mt-0.5 text-meta text-text-2">{preview.sectionTitle}</p>

      {decided && decidedAccrual ? (
        <p className="mt-2 text-body tnum" data-testid="accrual-done">
          Доля раздела {fmtShare(decidedAccrual.fromBp)} → {fmtShare(decidedAccrual.toBp)},
          начислено {fmtRub(decidedAccrual.rub)}
          {decidedAccrual.reason ? `. Причина: ${decidedAccrual.reason}` : ""}
        </p>
      ) : (
        <>
          <p className="mt-2 text-body tnum" data-testid="accrual-suggested">
            {noNorm
              ? `Доля выполнения раздела: предложения нет (${preview.basis}) · было ${fmtShare(preview.fromBp)}`
              : `Доля выполнения раздела: предложено ${fmtShare(preview.suggestedBp!)} (${preview.basis}) · было ${fmtShare(preview.fromBp)}`}
          </p>
          {preview.foremanDone === true ? (
            <p className="mt-1 text-meta text-text-2">Бригадир ответил: работы закончены.</p>
          ) : null}

          {draft.manual ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
              <label className="grid gap-1 text-meta text-text-2" htmlFor={manualId}>
                Сумма, ₽
                <input
                  id={manualId}
                  inputMode="numeric"
                  value={draft.manualRub}
                  onChange={(e) => set({ manualRub: e.target.value })}
                  className="h-12 rounded-control border border-line-2 bg-surface px-3 text-body text-text tnum focus-ring"
                />
              </label>
              <label className="grid gap-1 text-meta text-text-2" htmlFor={reasonId}>
                Причина
                <input
                  id={reasonId}
                  value={draft.reason}
                  onChange={(e) => set({ reason: e.target.value })}
                  placeholder="акт, договорённость с заказчиком"
                  className="h-12 rounded-control border border-line-2 bg-surface px-3 text-body text-text focus-ring"
                />
              </label>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-meta text-text-2" htmlFor={percentId}>
                Доля, %
                <input
                  id={percentId}
                  inputMode="decimal"
                  value={draft.done ? "100" : draft.percent}
                  disabled={draft.done}
                  placeholder={
                    noNorm ? "" : String((preview.suggestedBp ?? 0) / 100).replace(".", ",")
                  }
                  onChange={(e) => set({ percent: e.target.value })}
                  className="h-12 w-28 rounded-control border border-line-2 bg-surface px-3 text-body text-text tnum focus-ring disabled:opacity-60"
                />
              </label>
              <button
                type="button"
                aria-pressed={draft.done}
                onClick={() => set({ done: !draft.done, percent: "" })}
                className={cn(
                  "inline-flex h-12 items-center rounded-control border px-4 text-body focus-ring press-98",
                  draft.done
                    ? "border-orange-strong bg-orange-soft text-text"
                    : "border-line-2 bg-surface text-text",
                )}
              >
                Раздел завершён
              </button>
            </div>
          )}

          <p
            className={cn("mt-2 text-body tnum", !result.ok && "text-danger")}
            data-testid="accrual-amount"
            aria-live="polite"
          >
            {result.ok
              ? `Начисление: ${fmtRub(result.rub)} при доле ${fmtShare(result.toBp)}`
              : result.reason}
          </p>
          <p className="mt-0.5 text-meta text-text-3 tnum">
            Стоимость работ раздела{" "}
            {preview.workRub === null ? "нет в смете" : fmtRub(preview.workRub)}
            {" · "}начислено {fmtRub(preview.accruedRub)}
            {preview.remainingRub === null ? "" : ` · остаток ${fmtRub(preview.remainingRub)}`}
          </p>
          <button
            type="button"
            onClick={() => set({ manual: !draft.manual })}
            className="mt-2 inline-flex min-h-11 items-center text-meta text-text-2 underline underline-offset-2 focus-ring"
          >
            {draft.manual ? "Начислить по доле" : "Начислить вручную с причиной"}
          </button>
        </>
      )}
    </section>
  );
}
