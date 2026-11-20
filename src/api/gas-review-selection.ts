import { useGasOps } from "@/lib/gas-ops/use-gas-ops";
import { canPickReview, canSelectReview } from "@/domain/gas-ops/review-selection";
import { queue } from "@/domain/gas-ops/view";
import type { GasOpsPort } from "@/ports/gas-ops";

export {
  canPickReview,
  canSelectReview,
  filterReviewPeriod,
} from "@/domain/gas-ops/review-selection";

/** Перед каждым решением перечитываем состояние: чужое решение не входит в нашу отмену. */
/**
 * `withRemarks` — человек подтвердил, что принимает и записи с замечаниями: тогда проходят
 * все, которые можно принять; без него — только записи без замечаний
 */
export async function confirmReviewSelection(
  port: GasOpsPort,
  ids: string[],
  options: { withRemarks?: boolean } = {},
) {
  const allowed = options.withRemarks ? canPickReview : canSelectReview;
  const done: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const id of new Set(ids)) {
    try {
      const view = queue(await port.snapshot()).find((row) => row.entry.id === id);
      if (!view || !allowed(view)) {
        failed.push({ id, message: "Запись изменилась или требует индивидуальной проверки" });
        continue;
      }
      await port.review({ id, action: "confirm" });
      done.push(id);
    } catch (error) {
      failed.push({
        id,
        message: error instanceof Error ? error.message : "Не удалось принять запись",
      });
    }
  }
  return { done, failed };
}

export function useGasReviewSelection() {
  const port = useGasOps();
  return (ids: string[], options?: { withRemarks?: boolean }) =>
    confirmReviewSelection(port, ids, options);
}
