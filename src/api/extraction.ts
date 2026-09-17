import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ExtractionJob } from "@/contracts";
import { isActiveJob } from "@/domain/extraction";
import { invalidate } from "./mutations";

/**
 * Задача извлечения завершилась, пока экран открыт: появились позиции и изменились сводки.
 * Опрос обновляет сам документ; позиции и объект перечитываем по переходу задачи в конечный статус.
 */
export function useExtractionJobsWatch(jobs: (ExtractionJob | null | undefined)[]) {
  const queryClient = useQueryClient();
  const active = useRef(new Set<string>());
  const current = jobs.filter((job): job is ExtractionJob => !!job);
  const key = current.map((job) => `${job.id}:${job.status}`).join("|");

  useEffect(() => {
    const now = new Set(current.filter(isActiveJob).map((job) => job.id));
    const finished = [...active.current].some((id) => !now.has(id));
    active.current = now;
    if (finished) void invalidate(queryClient, ["positions", "projects", "timeline"]);
    // key — снимок статусов задач; массив jobs новый на каждом рендере
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, queryClient]);
}
