/**
 * Решение по факту (ADR-028, п. 3): принять, исправить объём, вернуть на уточнение.
 * Решение применяется сразу, отмена живёт 6 секунд: отчёт возвращается в очередь, а принятый
 * объём снимается из «Хода работ» той же операцией. Один и тот же хук держат карточка
 * очереди и лист деталей: кнопки, свайп и капсула делают одно и то же.
 */
import { useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccess } from "@/api/access";
import { useReviewReport } from "@/api/mutations";
import { fmtNum } from "@/lib/format";
import { toast, toastRetry, toastUndo } from "@/lib/toast";
import type { FactRow } from "./model";

export function useFactDecision({ card, zoneName }: FactRow, onDone?: () => void) {
  const { report } = card;
  const { can } = useAccess();
  const [qtyOpen, setQtyOpen] = useState(false);
  const [qty, setQty] = useState(String(report.declaredQty ?? ""));
  /*
   * Уведомление с отменой вешается на саму операцию, а не на вызов: карточка уходит из очереди
   * сразу (оптимистичное обновление), лист деталей закрывается, а уведомление должно прийти.
   */
  const review = useReviewReport({
    onFailed: () => toastRetry("Решение не сохранилось", () => undefined),
    onDone: (input) => {
      if (input.status === "accepted")
        toastUndo(
          `Принято ${fmtNum(input.acceptedQty ?? 0)} ${report.unit}`,
          undo,
          `${report.workType} · ${zoneName}`,
        );
      else if (input.status === "returned")
        toastUndo("Возвращено на уточнение", undo, `${report.workType} · ${zoneName}`);
    },
  });
  // Директор видит очередь, но решений не принимает (ADR-012)
  const mayDecide = can("field-reports", "write");

  function undo() {
    review.mutate({ id: report.id, status: "review", acceptedQty: null });
  }

  const accept = (value: number = report.declaredQty ?? 0) => {
    onDone?.();
    review.mutate({ id: report.id, status: "accepted", acceptedQty: value });
  };

  const back = () => {
    onDone?.();
    review.mutate({ id: report.id, status: "returned", acceptedQty: null });
  };

  const qtySheet = qtyOpen ? (
    <BottomSheet
      open
      onOpenChange={setQtyOpen}
      title="Принятый объём"
      description={`${report.workType} · ${zoneName}`}
    >
      <div className="space-y-4 p-4 pt-0">
        <label className="block">
          <span className="text-[13px] text-text-3">Объём, {report.unit}</span>
          <Input
            autoFocus
            inputMode="decimal"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            className="mt-1.5"
          />
        </label>
        <Button
          variant="accent"
          className="h-14 w-full rounded-full text-[16px] lg:h-12"
          onClick={() => {
            const value = Number(qty.replace(",", "."));
            if (!Number.isFinite(value) || value < 0) {
              toast.error("Объём — положительное число");
              return;
            }
            setQtyOpen(false);
            accept(value);
          }}
        >
          Принять {qty || "—"} {report.unit}
        </Button>
      </div>
    </BottomSheet>
  ) : null;

  return { mayDecide, accept, back, openQty: () => setQtyOpen(true), qtySheet };
}
