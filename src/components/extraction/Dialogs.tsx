import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { ImpactPreview } from "@/components/common/ImpactPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExtractedPosition } from "@/mock/repository";
import { fmtNum } from "@/lib/format";

export function SplitDialog({
  item,
  onOpenChange,
  onSplit,
}: {
  item: ExtractedPosition | null;
  onOpenChange: (open: boolean) => void;
  onSplit: (id: string, firstQty: number) => void;
}) {
  const [first, setFirst] = useState("");
  useEffect(() => {
    if (item) setFirst(String(Math.round(item.qty / 2)));
  }, [item]);
  if (!item) return null;
  const firstQty = Number(first.replace(/\s/g, "").replace(",", "."));
  const valid = Number.isFinite(firstQty) && firstQty > 0 && firstQty < item.qty;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Разделить позицию {item.position}</DialogTitle>
          <DialogDescription className="line-clamp-2">{item.projectName}</DialogDescription>
        </DialogHeader>
        <form
          id="split-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSplit(item.id, firstQty);
          }}
          className="grid grid-cols-2 gap-3"
        >
          <label className="grid gap-1.5 text-caption text-text-secondary">
            Первая часть, {item.unit}
            <Input
              autoFocus
              inputMode="decimal"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className="tnum"
              aria-invalid={!valid}
            />
          </label>
          <div className="grid gap-1.5 text-caption text-text-secondary">
            Вторая часть, {item.unit}
            <div className="tnum flex h-[38px] items-center rounded-[var(--r-sm)] border border-border bg-subtle px-3 text-sm text-text-primary">
              {valid ? fmtNum(item.qty - firstQty) : "—"}
            </div>
          </div>
          <p className="col-span-2 text-caption text-text-muted">
            Всего {fmtNum(item.qty)} {item.unit}. Обе части попадут на проверку как отдельные
            позиции.
          </p>
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" form="split-form" variant="accent" disabled={!valid}>
            Разделить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface SendSummary {
  create: number;
  needNormalization: number;
  withoutCharacteristics: number;
  region: string;
  pendingLeft: number;
  excluded: number;
}

export function SendDialog({
  open,
  summary,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  summary: SendSummary;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Передать проверенные позиции в закупку</DialogTitle>
          <DialogDescription>
            Проверьте последствия: после передачи позиции можно включать в запросы поставщикам.
            Непроверенные строки останутся на проверке.
          </DialogDescription>
        </DialogHeader>
        <ImpactPreview
          title="Что произойдёт"
          changes={[
            {
              label: "Станут доступны для запросов поставщикам",
              after: `${fmtNum(summary.create)} поз.`,
            },
            {
              label: "Из них требуют нормализации",
              after: fmtNum(summary.needNormalization),
              hint: "Наименование не сопоставлено со справочником. Нормализуйте до запроса, иначе поставщики получат проектные названия.",
            },
            {
              label: "Регион объекта",
              after: summary.region,
              hint: "Поставщики для запросов подбираются по региону.",
            },
            {
              label: "Позиций без характеристик",
              after: fmtNum(summary.withoutCharacteristics),
              hint: "Поставщик не сможет подобрать аналог без марки, толщины или покрытия.",
            },
          ]}
        />
        {(summary.pendingLeft > 0 || summary.excluded > 0) && (
          <p className="text-caption text-text-muted">
            Не будут переданы: непроверенные — {fmtNum(summary.pendingLeft)}, исключённые и
            объединённые — {fmtNum(summary.excluded)}.
          </p>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Вернуться к проверке
          </Button>
          <Button variant="accent" onClick={onConfirm} autoFocus>
            <Send className="size-4" /> Передать {fmtNum(summary.create)} поз.
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
