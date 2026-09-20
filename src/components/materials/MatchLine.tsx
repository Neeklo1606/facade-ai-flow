import { useId } from "react";
import { Check, Link2 } from "lucide-react";
import type { ExtractedPosition } from "@/contracts";
import { useCatalog } from "@/api/catalog";
import { useDirectory } from "@/api/directory";
import { useConfirmMatch } from "@/api/mutations";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Сопоставление позиции с материалом справочника (ADR-014, п. 1): что предложила система,
 * кто и когда подтвердил. Подтвердить можно предложенный материал или выбрать другой.
 * Позиция, уже ушедшая в запрос, не пересопоставляется.
 */
export function MatchLine({
  item,
  canEdit,
  className,
}: {
  item: ExtractedPosition;
  canEdit: boolean;
  className?: string;
}) {
  const { materials, pathOf } = useCatalog();
  const { employeeName } = useDirectory();
  const confirm = useConfirmMatch();
  const selectId = useId();
  const editable = canEdit && item.purchase === "none";

  const save = (materialId: string) =>
    confirm.mutate(
      { positionId: item.id, materialId },
      {
        onSuccess: (position) =>
          toast.success("Сопоставление подтверждено", {
            description: `Поз. ${position.position}: ${position.normalizedName ?? "—"}`,
          }),
        onError: (error) => toast.error("Не сопоставлено", { description: error.message }),
      },
    );

  // Материалы по категориям: так их ищет человек, который знает, что покупает
  const groups = new Map<string, typeof materials>();
  for (const material of materials) {
    const label = pathOf(material.categoryId)
      .map((category) => category.name)
      .join(" › ");
    groups.set(label, [...(groups.get(label) ?? []), material]);
  }

  return (
    <div
      className={cn("grid gap-1.5 text-[13px]", className)}
      data-match={item.matchStatus}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Link2 className="size-3.5 shrink-0 text-text-3" aria-hidden />
        {item.matchStatus === "confirmed" ? (
          <>
            <span className="text-text">{item.normalizedName}</span>
            <span className="text-caption text-text-3">
              подтвердил {employeeName(item.matchedBy ?? "")}
              {item.matchedAt ? `, ${fmtDateTime(item.matchedAt)}` : ""}
            </span>
          </>
        ) : item.matchStatus === "suggested" ? (
          <>
            <span className="text-text-2">Предложено системой:</span>
            <span className="text-text">{item.normalizedName}</span>
            <span className="text-caption text-warn">не подтверждено — в запрос не уйдёт</span>
          </>
        ) : (
          <span className="text-warn">Не сопоставлено со справочником — в запрос не уйдёт</span>
        )}
      </p>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {item.matchStatus === "suggested" && item.materialId && (
            <Button
              size="sm"
              variant="secondary"
              className="h-11 px-2.5 text-[12px] lg:h-7"
              disabled={confirm.isPending}
              onClick={() => save(item.materialId!)}
            >
              <Check className="size-3.5" /> Подтвердить сопоставление
            </Button>
          )}
          <label htmlFor={selectId} className="sr-only">
            Материал справочника для поз. {item.position}
          </label>
          <select
            id={selectId}
            value=""
            disabled={confirm.isPending}
            onChange={(event) => event.target.value && save(event.target.value)}
            className="focus-ring h-11 max-w-full rounded-[var(--r-sm)] border border-line bg-surface-2 px-2 text-[12px] text-text lg:h-7"
          >
            <option value="">
              {item.matchStatus === "none" ? "Выбрать материал…" : "Другой материал…"}
            </option>
            {[...groups].map(([label, list]) => (
              <optgroup key={label} label={label}>
                {list.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}, {material.unit}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
