import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ColumnCalc } from "@/lib/procurement";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDirectory } from "@/api/directory";

const approverRoles = new Set(["manager", "finance", "supply"]);
const MIN_REASON = 15;

export interface DecisionInput {
  supplierId: string;
  reason: string;
  approvedBy: string;
}

/** Фиксация выбора поставщика: кто, почему и кто согласовал. Причина обязательна. */
export function DecisionDialog({
  open,
  onOpenChange,
  columns,
  bestSupplierId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnCalc[];
  bestSupplierId: string | null;
  onSave: (input: DecisionInput) => void;
}) {
  const { counterpartyById, employees } = useDirectory();
  const answered = columns.filter((c) => c.offerId);
  const approvers = employees.filter((e) => approverRoles.has(e.role));
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [approvedBy, setApprovedBy] = useState("e-sokolov");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setSupplierId(bestSupplierId);
      setReason("");
      setTouched(false);
    }
  }, [open, bestSupplierId]);

  const chosen = answered.find((c) => c.supplierId === supplierId);
  const reasonError = reason.trim().length < MIN_REASON;
  const notBest = chosen && bestSupplierId && chosen.supplierId !== bestSupplierId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-dvh flex-col sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Зафиксировать решение</DialogTitle>
          <DialogDescription>
            Решение попадёт в историю объекта с причиной и согласованием — к нему можно будет
            вернуться при приёмке и претензиях.
          </DialogDescription>
        </DialogHeader>

        <form
          id="decision-form"
          className="grid min-h-0 gap-4 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!supplierId || reasonError) return;
            onSave({ supplierId, reason: reason.trim(), approvedBy });
          }}
        >
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-[13px] font-medium">Выбранный поставщик</legend>
            {answered.map((c) => {
              const selected = c.supplierId === supplierId;
              return (
                <button
                  key={c.supplierId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSupplierId(c.supplierId)}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-[var(--r-md)] border px-3 py-2 text-left transition-fast",
                    selected ? "border-accent bg-accent-subtle" : "border-border hover:bg-hover",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border",
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border-strong",
                    )}
                  >
                    {selected && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">
                      {counterpartyById(c.supplierId)?.name}
                      {c.supplierId === bestSupplierId && (
                        <span className="ml-2 text-caption font-normal text-ok">
                          лучшее по итогу
                        </span>
                      )}
                    </span>
                    <span className="block text-caption text-text-muted">
                      {c.complete ? "все позиции" : "не все позиции"} · до {c.maxLeadTime} дн. ·
                      отклонений {c.deviations}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[14px] font-semibold">
                    {fmtMoney(c.total)}
                  </span>
                </button>
              );
            })}
          </fieldset>

          {notBest && (
            <p className="flex gap-2 rounded-[var(--r-md)] bg-warn-bg px-3 py-2 text-caption text-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Выбрано не самое выгодное предложение — объясните в причине, почему.
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="decision-reason">
              Причина выбора <span className="text-danger">*</span>
            </Label>
            <Textarea
              id="decision-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && reasonError}
              placeholder="Например: полный объём, соответствует спецификации, срок успевает к началу монтажа"
            />
            <p
              className={cn(
                "text-caption",
                touched && reasonError ? "text-danger" : "text-text-muted",
              )}
            >
              {touched && reasonError
                ? `Опишите причину — не короче ${MIN_REASON} символов`
                : "Будет видна в истории объекта и в карточке позиции"}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="decision-approver">Кто согласовал</Label>
            <select
              id="decision-approver"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              className="focus-ring h-11 rounded-[var(--r-sm)] border border-border bg-surface px-3 text-sm lg:h-[38px]"
            >
              {approvers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.position}
                </option>
              ))}
            </select>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" form="decision-form" variant="accent" disabled={!supplierId}>
            Зафиксировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
