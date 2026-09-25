import { useEffect, useId, useState, type FormEvent } from "react";
import { useCreatePosition } from "@/api/mutations";
import { useCatalog } from "@/api/catalog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

/**
 * Завести позицию спецификации руками (ADR-025). Пока разбора документов нет, это единственный
 * способ добавить строку по одной; пачкой — загрузкой из Excel.
 */
export function CreatePositionDialog({
  open,
  onOpenChange,
  revisionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisionId: string;
}) {
  const create = useCreatePosition();
  const { suggest, materials } = useCatalog();
  const ids = { name: useId(), qty: useId(), unit: useId(), position: useId() };
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("шт");
  const [position, setPosition] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setQty("");
    setUnit("шт");
    setPosition("");
  }, [open]);

  // Что предложит справочник: человек видит это до сохранения, а не после
  const suggestion = name.trim().length >= 3 ? suggest(name.trim()) : null;
  const material = suggestion
    ? (materials.find((item) => item.id === suggestion.materialId) ?? null)
    : null;
  const qtyNumber = Number(qty.replace(",", "."));
  const valid =
    name.trim().length >= 3 &&
    unit.trim().length > 0 &&
    Number.isFinite(qtyNumber) &&
    qtyNumber > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    create.mutate(
      {
        revisionId,
        projectName: name.trim(),
        qty: qtyNumber,
        unit: unit.trim(),
        ...(position.trim() ? { position: position.trim() } : {}),
      },
      {
        onSuccess: (saved) => {
          toast.success(`Позиция ${saved.position} заведена`, {
            description: saved.materialId
              ? "Материал предложен по наименованию: подтвердите сопоставление в карточке."
              : "Материал справочника не найден: сопоставьте его руками в карточке позиции.",
          });
          onOpenChange(false);
        },
        onError: (error) => toast.error("Не сохранено", { description: error.message }),
      },
    );
  };

  const field =
    "focus-ring w-full rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2 text-[14px] text-text placeholder:text-text-3";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Завести позицию</DialogTitle>
          <DialogDescription>
            Наименование — как в проекте. Уверенность распознавания у такой строки единица: её не
            распознавали, а ввели, и места на листе у неё нет.
          </DialogDescription>
        </DialogHeader>
        <form id="position-form" onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={ids.name} className="text-[13px] text-text-2">
              Наименование как в проекте
            </label>
            <input
              id={ids.name}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={300}
              className={field}
            />
            {material && (
              <p className="text-caption text-text-2">
                Справочник предложит: <b className="text-text">{material.name}</b>. Подтвердить
                сопоставление нужно будет в карточке позиции.
              </p>
            )}
            {name.trim().length >= 3 && !material && (
              <p className="text-caption text-text-3">
                Похожего материала в справочнике нет: позиция встанет как «не сопоставлено».
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
            <div className="grid gap-1.5">
              <label htmlFor={ids.qty} className="text-[13px] text-text-2">
                Количество
              </label>
              <input
                id={ids.qty}
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                inputMode="decimal"
                className={field}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.unit} className="text-[13px] text-text-2">
                Единица
              </label>
              <input
                id={ids.unit}
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                maxLength={20}
                className={field}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.position} className="text-[13px] text-text-2">
                Номер — можно не задавать
              </label>
              <input
                id={ids.position}
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                placeholder="следующий"
                maxLength={24}
                className={field}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="submit"
            form="position-form"
            variant="accent"
            disabled={!valid || create.isPending}
          >
            Завести
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
