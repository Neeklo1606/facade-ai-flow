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
  ReviewReportInput,
  SplitPositionInput,
  UndoReviewInput,
  UploadRevisionInput,
} from "@/ports";
import { toast } from "@/lib/toast";
import { api } from "./client";
import { CURRENT_USER_ID } from "./config";
import type { Area } from "./keys";
import type { ReportCard } from "./types";

/**
 * Мутации экранов (ADR-002, п. 2). После успеха инвалидируются только области из таблицы
 * в keys.ts; решения проверки и приёмка отчёта обновляют списки оптимистично и откатываются
 * при ошибке. «Отменить» в уведомлении — обратная мутация undoReview.
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

/** Оптимистичное изменение не сохранилось: вернуть список и сказать об этом */
function failed(queryClient: QueryClient, snapshot: Snapshot | undefined) {
  rollback(queryClient, snapshot);
  toast.error("Изменение не сохранилось", { description: "Список возвращён к прежнему виду." });
}

const REVIEW_AREAS: Area[] = ["positions", "documents", "projects"];
const REVIEW_MUTATION = ["positions"];

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

  /**
   * Список позиций перечитываем, только когда завершилась последняя мутация проверки: ответ на первое
   * из быстрых подтверждений вернул бы в список строки, решения по которым ещё в пути.
   * В onSettled мутация ещё считается выполняющейся, поэтому последняя — это «одна».
   */
  const settle = (areas: Area[]) =>
    invalidate(
      queryClient,
      queryClient.isMutating({ mutationKey: REVIEW_MUTATION }) <= 1
        ? areas
        : areas.filter((area) => area !== "positions"),
    );

  const confirm = useMutation({
    mutationKey: REVIEW_MUTATION,
    mutationFn: (ids: string[]) => api.positions.confirm(ids),
    onMutate: (ids) => patchPositions(new Set(ids), reviewed("confirmed")),
    onError: (_error, _ids, snapshot) => failed(queryClient, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const correct = useMutation({
    mutationKey: REVIEW_MUTATION,
    mutationFn: (input: CorrectPositionInput) => api.positions.correct(input),
    onMutate: ({ id, ...patch }) =>
      patchPositions(new Set([id]), (item) => ({ ...reviewed("corrected")(item), ...patch })),
    onError: (_error, _input, snapshot) => failed(queryClient, snapshot),
    // Исправленное количество попадает в историю объекта
    onSettled: () => settle([...REVIEW_AREAS, "timeline"]),
  });

  const exclude = useMutation({
    mutationKey: REVIEW_MUTATION,
    mutationFn: (id: string) => api.positions.exclude(id),
    onMutate: (id) => patchPositions(new Set([id]), reviewed("excluded")),
    onError: (_error, _id, snapshot) => failed(queryClient, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const markHeader = useMutation({
    mutationKey: REVIEW_MUTATION,
    mutationFn: (id: string) => api.positions.markHeader(id),
    onMutate: (id) => patchPositions(new Set([id]), reviewed("header")),
    onError: (_error, _id, snapshot) => failed(queryClient, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const reopen = useMutation({
    mutationKey: REVIEW_MUTATION,
    mutationFn: (id: string) => api.positions.reopen(id),
    onMutate: (id) =>
      patchPositions(new Set([id]), (item) => ({
        ...item,
        review: "pending",
        reviewedBy: null,
        reviewedAt: null,
        mergedInto: null,
      })),
    onError: (_error, _id, snapshot) => failed(queryClient, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  /** Обратная мутация для «Отменить»: сервер возвращает прежнее решение и пишет отмену в журнал */
  const undoReview = useMutation({
    mutationKey: REVIEW_MUTATION,
    mutationFn: (input: UndoReviewInput) => api.positions.undoReview(input),
    onMutate: ({ items }) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      return patchPositions(new Set(byId.keys()), (item) => {
        const undo = byId.get(item.id)!;
        if (item.review !== undo.from) return item;
        return {
          ...item,
          review: undo.to,
          mergedInto: null,
          reviewedBy: undo.to === "pending" ? null : CURRENT_USER_ID,
        };
      });
    },
    onSuccess: (undone) => {
      if (undone === 0) {
        toast("Отменить не получилось", {
          description: "Позицию уже изменили другим действием — проверьте её вручную.",
        });
      }
    },
    onError: (_error, _input, snapshot) => failed(queryClient, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const merge = useMutation({
    mutationKey: REVIEW_MUTATION,
    mutationFn: (input: MergePositionsInput) => api.positions.merge(input),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const split = useMutation({
    mutationKey: REVIEW_MUTATION,
    mutationFn: (input: SplitPositionInput) => api.positions.split(input),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const handOver = useMutation({
    mutationFn: (revisionId: string) => api.positions.handOver(revisionId),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  return { confirm, correct, exclude, markHeader, reopen, undoReview, merge, split, handOver };
}

/** «Отменить» решение `from` у позиций: вернуть каждой решение, которое было в снимке до действия */
export function undoInput(before: ExtractedPosition[], from: ExtractedPosition["review"]) {
  const items = before
    .filter((item) => item.review !== from && item.review !== "merged")
    .map((item) => ({
      id: item.id,
      from,
      to: item.review as UndoReviewInput["items"][number]["to"],
    }));
  return { items } satisfies UndoReviewInput;
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
    // Ответы на напоминание приходят позже событиями и обновляют свои области сами
    onSettled: () => invalidate(queryClient, ["procurement"]),
  });
}

export function useRecordDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordDecisionInput) => api.procurement.recordDecision(input),
    // reports: карточка источника показывает решения, принятые на его основании
    onSettled: () => invalidate(queryClient, [...PROCUREMENT_AREAS, "reports"]),
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
    onError: (_error, _input, snapshot) => failed(queryClient, snapshot),
    onSettled: () => invalidate(queryClient, ["reports"]),
  });
}

/** Сброс демо-данных: после него весь кеш запросов устарел */
export function useResetDemo() {
  const queryClient = useQueryClient();
  return () => {
    api.demo.reset();
    // Сбросить к исходному состоянию и перезапросить активные запросы: removeQueries отцепил бы их от кеша
    void queryClient.resetQueries();
  };
}
