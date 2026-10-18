import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ExtractionResult } from "@/contracts";
import type { CaptureInput } from "@/ports";
import { api } from "./client";
import { keys } from "./keys";

/**
 * Отправка записи (ADR-036, п. 6). Сначала сохраняется факт, потом делается разбор: разбор
 * может не получиться, и это не повод потерять запись.
 *
 * Повтор отправки идёт с тем же ключом, поэтому дубля не возникает — это проверяет и порт,
 * и сквозной тест.
 */
export interface CaptureOutcome {
  sourceId: string;
  repeated: boolean;
  /** Разбор, если он получился; `null` — речи не было или модель не разобрала */
  draft: ExtractionResult | null;
  /** Почему разбора нет: показывается словами, без «что-то пошло не так» */
  refusal: string | null;
  by: { provider: string; model: string; demo: boolean } | null;
}

export function useCapture() {
  const client = useQueryClient();
  return useMutation<CaptureOutcome, Error, CaptureInput>({
    mutationFn: async (input) => {
      const saved = await api.capture.save(input);
      let draft: ExtractionResult | null = null;
      let refusal: string | null = null;
      let by: CaptureOutcome["by"] = null;
      const text = input.text.trim();
      if (text.length > 0) {
        const parsed = await api.capture.extract({
          projectId: input.projectId,
          message: text,
          sourceId: saved.source.id,
        });
        by = parsed.by;
        if (parsed.ok) draft = parsed.draft;
        else refusal = parsed.reason;
      }
      return { sourceId: saved.source.id, repeated: saved.repeated, draft, refusal, by };
    },
    onSuccess: (_outcome, input) => {
      // Источник появился в ленте объекта и в журнале обработок: обновляем то, что их читает
      void client.invalidateQueries({ queryKey: keys.reports.list(input.projectId) });
      void client.invalidateQueries({ queryKey: keys.projects.card(input.projectId) });
    },
  });
}
