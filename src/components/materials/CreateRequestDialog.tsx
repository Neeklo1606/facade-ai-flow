import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { counterparties, type ExtractedPosition } from "@/mock/repository";
import { isVerified } from "@/lib/spec-store";
import { fmtNum } from "@/lib/format";

/** Кого предложить по умолчанию: поставщики с быстрым ответом и хорошим рейтингом. */
const suppliers = counterparties
  .filter((c) => c.role === "supplier")
  .sort((a, b) => a.avgReplyHours - b.avgReplyHours);

export function CreateRequestDialog({
  open,
  selected,
  region,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  selected: ExtractedPosition[];
  region: string;
  onOpenChange: (open: boolean) => void;
  onCreate: (supplierIds: string[]) => void;
}) {
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  useEffect(() => {
    if (open) setSupplierIds(suppliers.filter((s) => s.rating >= 4.1).map((s) => s.id));
  }, [open]);

  const { eligible, unverified, inWork } = useMemo(
    () => ({
      eligible: selected.filter((item) => isVerified(item) && item.purchase === "none"),
      unverified: selected.filter((item) => !isVerified(item)).length,
      inWork: selected.filter((item) => isVerified(item) && item.purchase !== "none").length,
    }),
    [selected],
  );
  const groups = [...new Set(eligible.map((item) => item.group))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Запрос поставщикам</DialogTitle>
          <DialogDescription>
            {fmtNum(eligible.length)} поз. · {groups.join(", ") || "—"} · регион {region}
          </DialogDescription>
        </DialogHeader>

        {(unverified > 0 || inWork > 0) && (
          <p className="rounded-[var(--r-md)] bg-warn-bg px-3 py-2 text-caption text-warn">
            Не войдут в запрос: {unverified > 0 && `непроверенные — ${fmtNum(unverified)}`}
            {unverified > 0 && inWork > 0 && ", "}
            {inWork > 0 && `уже в закупке — ${fmtNum(inWork)}`}.
          </p>
        )}

        <fieldset>
          <legend className="text-caption font-medium text-text-secondary">Кому отправить</legend>
          <ul className="mt-2 divide-y divide-border rounded-[var(--r-md)] border border-border">
            {suppliers.map((supplier) => {
              const checked = supplierIds.includes(supplier.id);
              return (
                <li key={supplier.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-hover">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        setSupplierIds((prev) =>
                          value ? [...prev, supplier.id] : prev.filter((id) => id !== supplier.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{supplier.name}</span>
                      <span className="block text-caption text-text-muted">
                        Отвечает в среднем за {supplier.avgReplyHours} ч · рейтинг{" "}
                        {supplier.rating.toLocaleString("ru-RU")}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="accent"
            disabled={!eligible.length || !supplierIds.length}
            onClick={() => onCreate(supplierIds)}
          >
            Отправить {supplierIds.length} {supplierIds.length === 1 ? "поставщику" : "поставщикам"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
