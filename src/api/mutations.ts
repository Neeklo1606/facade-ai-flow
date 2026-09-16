import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { ExtractedPosition } from "@/contracts";
import type {
  CorrectPositionInput,
  CreateProjectInput,
  CreateRequestInput,
  MergePositionsInput,
  Page,
  RecordDecisionInput,
  RestoreReviewInput,
  ReviewReportInput,
  SplitPositionInput,
  UploadRevisionInput,
} from "@/ports";
import { api } from "./client";
import { CURRENT_USER_ID } from "./config";
import type { Area } from "./keys";
import type { ReportCard } from "./types";

/**
 * Мутации экранов (ADR-002, п. 2). После успеха инвалидируются только области из таблицы
 * в keys.ts; решения проверки и приёмка отчёта обновляют списки оптимистично и откатываются
 * при ошибке. «Отменить» в уведомлении — обратная мутация restoreReview.
 */

export function invalidate(queryClient: QueryClient, areas: Area[]) {
  return Promise.all(areas.map((area) => queryClient.invalidateQueries({ queryKey: [area] })));
}

type Snapshot = [QueryKey, unknown][];

async function patchLists<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  update: (data: T) => T,
): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey });
  const snapshot = queryClient.getQueriesData({ queryKey });
  queryClient.setQueriesData<T>({ queryKey }, (data) => (data ? update(data) : data));
  return snapshot;
}

function rollback(queryClient: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
}

const REVIEW_AREAS: Area[] = ["positions", "documents", "projects"];

/** Решения по позициям на экране проверки */
export function usePositionMutations() {
  const queryClient = useQueryClient();

  const patchPositions = (
    ids: Set<string>,
    patch: (item: ExtractedPosition) => ExtractedPosition,
  ) =>
    patchLists<Page<ExtractedPosition>>(queryClient, ["positions", "list"], (page) => ({
      ...page,
      items: page.items.map((item) => (ids.has(item.id) ? patch(item) : item)),
    }));

  const reviewed = (review: ExtractedPosition["review"]) => (item: ExtractedPosition) => ({
    ...item,
    review,
    reviewedBy: CURRENT_USER_ID,
  });

  const confirm = useMutation({
    mutationFn: (ids: string[]) => api.positions.confirm(ids),
    onMutate: (ids) => patchPositions(new Set(ids), reviewed("confirmed")),
    onError: (_error, _ids, snapshot) => rollback(queryClient, snapshot),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  const correct = useMutation({
    mutationFn: (input: CorrectPositionInput) => api.positions.correct(input),
    onMutate: ({ id, ...patch }) =>
      patchPositions(new Set([id]), (item) => ({ ...reviewed("corrected")(item), ...patch })),
    onError: (_error, _input, snapshot) => rollback(queryClient, snapshot),
    // Исправленное количество попадает в историю объекта
    onSettled: () => invalidate(queryClient, [...REVIEW_AREAS, "timeline"]),
  });

  const exclude = useMutation({
    mutationFn: (id: string) => api.positions.exclude(id),
    onMutate: (id) => patchPositions(new Set([id]), reviewed("excluded")),
    onError: (_error, _id, snapshot) => rollback(queryClient, snapshot),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  const markHeader = useMutation({
    mutationFn: (id: string) => api.positions.markHeader(id),
    onMutate: (id) => patchPositions(new Set([id]), reviewed("header")),
    onError: (_error, _id, snapshot) => rollback(queryClient, snapshot),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  const reopen = useMutation({
    mutationFn: (id: string) => api.positions.reopen(id),
    onMutate: (id) =>
      patchPositions(new Set([id]), (item) => ({
        ...item,
        review: "pending",
        reviewedBy: null,
        reviewedAt: null,
        mergedInto: null,
      })),
    onError: (_error, _id, snapshot) => rollback(queryClient, snapshot),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  /** Обратная мутация для «Отменить»: возвращает решения проверки к снимку */
  const restoreReview = useMutation({
    mutationFn: (input: RestoreReviewInput) => api.positions.restoreReview(input),
    onMutate: ({ items }) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      return patchPositions(new Set(byId.keys()), (item) => ({ ...item, ...byId.get(item.id)! }));
    },
    onError: (_error, _input, snapshot) => rollback(queryClient, snapshot),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  const merge = useMutation({
    mutationFn: (input: MergePositionsInput) => api.positions.merge(input),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  const split = useMutation({
    mutationFn: (input: SplitPositionInput) => api.positions.split(input),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  const handOver = useMutation({
    mutationFn: (revisionId: string) => api.positions.handOver(revisionId),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  return { confirm, correct, exclude, markHeader, reopen, restoreReview, merge, split, handOver };
}

/** Снимок решения проверки для обратной мутации */
export function reviewSnapshot(items: ExtractedPosition[]): RestoreReviewInput {
  return {
    items: items.map(({ id, review, reviewedBy, reviewedAt, mergedInto, qty }) => ({
      id,
      review,
      reviewedBy,
      reviewedAt,
      mergedInto,
      qty,
    })),
  };
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadRevisionInput) => api.documents.upload(input),
    onSettled: () => invalidate(queryClient, ["documents", "positions", "projects", "timeline"]),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.projects.create(input),
    onSettled: () => invalidate(queryClient, ["projects", "directory"]),
  });
}

const PROCUREMENT_AREAS: Area[] = ["procurement", "positions", "projects", "timeline"];

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequestInput) => api.procurement.createRequest(input),
    onSettled: () => invalidate(queryClient, PROCUREMENT_AREAS),
  });
}

export function useRemindSuppliers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => api.procurement.remind(requestId),
    onSettled: () => invalidate(queryClient, ["procurement"]),
  });
}

export function useRecordDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordDecisionInput) => api.procurement.recordDecision(input),
    onSettled: () => invalidate(queryClient, PROCUREMENT_AREAS),
  });
}

export function useVerifyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (supplierId: string) => api.procurement.verifyContact(supplierId),
    onSettled: () => invalidate(queryClient, ["procurement"]),
  });
}

export function useReviewReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewReportInput) => api.reports.review(input),
    onMutate: (input) =>
      patchLists<ReportCard[]>(queryClient, ["reports", "list"], (cards) =>
        cards.map((card) =>
          card.report.id === input.id
            ? {
                ...card,
                report: { ...card.report, status: input.status, acceptedQty: input.acceptedQty },
              }
            : card,
        ),
      ),
    onError: (_error, _input, snapshot) => rollback(queryClient, snapshot),
    onSettled: () => invalidate(queryClient, ["reports"]),
  });
}

/** Сброс демо-данных: после него весь кеш запросов устарел */
export function useResetDemo() {
  const queryClient = useQueryClient();
  return () => {
    api.demo.reset();
    queryClient.removeQueries();
    void queryClient.invalidateQueries();
  };
}
