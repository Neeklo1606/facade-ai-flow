import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Delivery } from "@/contracts";
import {
  acceptanceError,
  checklistFor,
  deliveryFamilies,
  hasDiscrepancy,
  lineDiscrepancies,
  remainder,
  type AcceptanceDraft,
} from "@/domain/deliveries";
import { queries } from "./queries";

export type { AcceptanceDraft, ChecklistItem, LineDiscrepancy } from "@/domain/deliveries";

/**
 * Правила приёмки для экрана (ADR-011): чек-лист по семействам материалов поставки и проверка
 * акта тем же правилом, что применит адаптер. Экран подсказывает заранее, адаптер решает.
 */
export function useAcceptanceRules(delivery: Delivery | null) {
  const materials = useQuery(queries.materials()).data;
  return useMemo(() => {
    const checklist = delivery ? checklistFor(deliveryFamilies(delivery, materials ?? [])) : [];
    return {
      checklist,
      discrepancies: (draft: Pick<AcceptanceDraft, "lines">) =>
        delivery ? lineDiscrepancies(delivery, draft) : [],
      hasDiscrepancy: (draft: Pick<AcceptanceDraft, "lines" | "checklist">) =>
        delivery ? hasDiscrepancy(delivery, draft) : false,
      error: (draft: AcceptanceDraft) =>
        delivery ? acceptanceError(delivery, draft, checklist) : null,
    };
  }, [delivery, materials]);
}

/** Остаток позиции к поставке: заказано минус поставлено */
export const positionRemainder = remainder;
