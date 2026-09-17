import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { ListPositionsInput, ListProjectsInput, PositionFilterInput } from "@/ports";
import type { ExtractionJob } from "@/contracts";
import { isActiveJob } from "@/domain/extraction";
import { api } from "./client";
import { keys } from "./keys";

/** Опции запросов для useQuery и loader (ensureQueryData). Один объект — один ключ и одна функция. */

/** Как часто спрашивать статус задачи извлечения, пока она идёт */
const JOB_POLL_MS = 2_000;
/** Не опрашивать бесконечно зависшую задачу: 10 минут с момента, как вкладка её увидела */
const JOB_POLL_WINDOW_MS = 10 * 60_000;
const jobFirstSeen = new Map<string, number>();

/** Идёт ли ещё опрос задачи: активна и вкладка видит её меньше 10 минут */
function shouldPollJob(job: ExtractionJob | null | undefined) {
  if (!job || !isActiveJob(job)) return false;
  const seen = jobFirstSeen.get(job.id) ?? Date.now();
  jobFirstSeen.set(job.id, seen);
  return Date.now() - seen < JOB_POLL_WINDOW_MS;
}
/** Срок ответа поставщиков («осталось 3 ч») считается от времени сервера — перечитываем раз в минуту */
const REPLY_DUE_REFRESH_MS = 60_000;

/** Справочники меняются редко: не перезапрашиваем их при каждом монтировании */
const reference = { staleTime: 5 * 60_000 } as const;

export const queries = {
  /** Часы идут: «осталось 3 ч» пересчитывается раз в минуту */
  now: () =>
    queryOptions({
      queryKey: keys.clock(),
      queryFn: api.clock.now,
      staleTime: 30_000,
      refetchInterval: 60_000,
    }),

  employees: () =>
    queryOptions({
      queryKey: keys.directory.employees(),
      queryFn: api.directory.employees,
      ...reference,
    }),
  counterparties: () =>
    queryOptions({
      queryKey: keys.directory.counterparties(),
      queryFn: api.directory.counterparties,
      ...reference,
    }),

  /** Реестр объектов; фильтр применяет сервер. Без фильтра — все объекты (меню, поиск, выбор объекта) */
  projects: (filter: ListProjectsInput = {}) =>
    queryOptions({
      queryKey: keys.projects.list(filter),
      queryFn: () => api.projects.list(filter),
    }),
  project: (id: string) =>
    queryOptions({ queryKey: keys.projects.card(id), queryFn: () => api.projects.card(id) }),

  documents: (projectId?: string) =>
    queryOptions({
      queryKey: keys.documents.list(projectId),
      queryFn: () => api.documents.list(projectId ? { projectId } : {}),
      // Пока идёт извлечение, опрашиваем статус задач (P3-4)
      refetchInterval: (query) =>
        query.state.data?.some((item) => shouldPollJob(item.job)) ? JOB_POLL_MS : false,
    }),
  revisions: (documentId: string) =>
    queryOptions({
      queryKey: keys.documents.revisions(documentId),
      queryFn: () => api.documents.revisions(documentId),
    }),
  document: (revisionId: string) =>
    queryOptions({
      queryKey: keys.documents.card(revisionId),
      queryFn: () => api.documents.card(revisionId),
      refetchInterval: (query) => (shouldPollJob(query.state.data?.job) ? JOB_POLL_MS : false),
    }),

  positions: (input: ListPositionsInput) =>
    queryOptions({
      queryKey: keys.positions.list(input),
      queryFn: () => api.positions.list(input),
    }),
  positionPages: (input: Omit<ListPositionsInput, "cursor">) =>
    infiniteQueryOptions({
      queryKey: keys.positions.pages(input),
      queryFn: ({ pageParam }) => api.positions.list({ ...input, cursor: pageParam }),
      initialPageParam: null as string | null,
      getNextPageParam: (page) => page.nextCursor,
    }),
  positionFacets: (input: PositionFilterInput) =>
    queryOptions({
      queryKey: keys.positions.facets(input),
      queryFn: () => api.positions.facets(input),
    }),
  positionSelection: (input: PositionFilterInput) =>
    queryOptions({
      queryKey: keys.positions.selection(input),
      queryFn: () => api.positions.selection(input),
    }),
  position: (positionId: string) =>
    queryOptions({
      queryKey: keys.positions.item(positionId),
      queryFn: () => api.positions.item(positionId),
    }),
  positionHistory: (positionId: string) =>
    queryOptions({
      queryKey: keys.positions.history(positionId),
      queryFn: () => api.positions.history(positionId),
    }),
  materials: () =>
    queryOptions({
      queryKey: keys.positions.materials(),
      queryFn: api.positions.materials,
      ...reference,
    }),
  replacements: () =>
    queryOptions({ queryKey: keys.positions.replacements(), queryFn: api.positions.replacements }),

  suppliers: () =>
    queryOptions({ queryKey: keys.procurement.suppliers(), queryFn: api.procurement.suppliers }),
  templates: () =>
    queryOptions({
      queryKey: keys.procurement.templates(),
      queryFn: api.procurement.templates,
      ...reference,
    }),
  requests: (projectId: string) =>
    queryOptions({
      queryKey: keys.procurement.requests(projectId),
      queryFn: () => api.procurement.requests(projectId),
      refetchInterval: REPLY_DUE_REFRESH_MS,
    }),
  request: (requestId: string) =>
    queryOptions({
      queryKey: keys.procurement.request(requestId),
      queryFn: () => api.procurement.request(requestId),
      refetchInterval: REPLY_DUE_REFRESH_MS,
    }),
  deliveries: (projectId: string) =>
    queryOptions({
      queryKey: keys.procurement.deliveries(projectId),
      queryFn: () => api.procurement.deliveries(projectId),
    }),

  reports: (projectId: string) =>
    queryOptions({
      queryKey: keys.reports.list(projectId),
      queryFn: () => api.reports.list(projectId),
    }),
  source: (sourceId: string) =>
    queryOptions({
      queryKey: keys.reports.source(sourceId),
      queryFn: () => api.reports.source(sourceId),
    }),

  timeline: (projectId: string) =>
    queryOptions({
      queryKey: keys.timeline.list(projectId),
      queryFn: () => api.timeline.list(projectId),
    }),
  decisions: (projectId: string) =>
    queryOptions({
      queryKey: keys.timeline.decisions(projectId),
      queryFn: () => api.timeline.decisions(projectId),
    }),
  pendingDecisions: (projectId: string) =>
    queryOptions({
      queryKey: keys.timeline.pending(projectId),
      queryFn: () => api.timeline.pending(projectId),
    }),
};
