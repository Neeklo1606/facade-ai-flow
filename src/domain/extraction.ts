import type { ExtractionJob } from "@/contracts";
import { wallMs } from "./time";

/**
 * Задачи извлечения (P3-4). Активная задача — та, которую обработчик ещё не закончил:
 * интерфейс опрашивает статус, пока такая есть.
 */
export function isActiveJob(job: Pick<ExtractionJob, "status">) {
  return job.status === "queued" || job.status === "recognizing" || job.status === "extracted";
}

/** Последняя задача ревизии */
export function latestJob(jobs: ExtractionJob[], revisionId: string) {
  return jobs
    .filter((job) => job.revisionId === revisionId)
    .reduce<ExtractionJob | null>(
      (acc, job) => (!acc || job.queuedAt > acc.queuedAt ? job : acc),
      null,
    );
}

const RECENT_MS = 60 * 60_000;

/**
 * Стадия для индикатора загрузки: пока задача идёт и ещё час после окончания — чтобы на экране
 * осталось «Готов к проверке» с переходом к позициям. Давно обработанным ревизиям индикатор не нужен.
 */
export function visibleStage(job: ExtractionJob | null, now: string) {
  if (!job) return null;
  if (isActiveJob(job)) return job.stage;
  if (!job.finishedAt) return null;
  return wallMs(now) - wallMs(job.finishedAt) <= RECENT_MS ? job.stage : null;
}
