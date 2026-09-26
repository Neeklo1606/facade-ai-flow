import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { confidenceBand, type ExtractedPosition } from "@/contracts";
import type {
  AcceptDeliveryInput,
  AskAgentInput,
  ChooseSupplierInput,
  CorrectPositionInput,
  CreatePositionInput,
  ImportSpecInput,
  ConfirmMatchInput,
  SaveMaterialInput,
  MoveDeliveryInput,
  ResolveRemarkInput,
  CreateProjectInput,
  CreateRequestInput,
  CompleteMilestoneInput,
  SaveZoneInput,
  ResolveChangeInput,
  SetProjectStatusInput,
  MergePositionsInput,
  Page,
  CreateReportInput,
  ImportMaterialsInput,
  SaveCategoryInput,
  SaveEmployeeInput,
  SaveSupplierInput,
  ReviewReportInput,
  SplitPositionInput,
  UndoReviewInput,
  UploadRevisionInput,
} from "@/ports";
import { api } from "./client";
import { currentUserId } from "./config";
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

/** Что экран показывает пользователю: слой данных сам уведомлений не рисует */
export interface MutationNotices {
  /** Изменение не сохранилось, список возвращён к прежнему виду; error.message — причина от сервера */
  onFailed?: (error: Error) => void;
  /** «Отменить» ничего не отменила: позицию успели изменить другим действием */
  onNothingUndone?: () => void;
}

const REVIEW_AREAS: Area[] = ["positions", "documents", "projects"];
const REVIEW_MUTATION = ["positions"];

/** Решения по позициям на экране проверки */
export function usePositionMutations(notices: MutationNotices = {}) {
  const queryClient = useQueryClient();

  /**
   * Оптимистично поправить позицию везде, где она лежит в кеше: одиночные страницы, страницы подряд
   * и карточка позиции. Счётчики не правим — их перечитывает сервер после мутации.
   */
  const patchWhere = async (
    match: (item: ExtractedPosition) => boolean,
    patch: (item: ExtractedPosition) => ExtractedPosition,
  ): Promise<Snapshot> => {
    const apply = (item: ExtractedPosition) => (match(item) ? patch(item) : item);
    const page = (data: Page<ExtractedPosition>) => ({ ...data, items: data.items.map(apply) });
    const list = await patchLists<Page<ExtractedPosition>>(
      queryClient,
      ["positions", "list"],
      page,
    );
    const pages = await patchLists<InfiniteData<Page<ExtractedPosition>>>(
      queryClient,
      ["positions", "pages"],
      (data) => ({ ...data, pages: data.pages.map(page) }),
    );
    const item = await patchLists<ExtractedPosition | null>(
      queryClient,
      ["positions", "item"],
      (data) => (data ? apply(data) : data),
    );
    return [...list, ...pages, ...item];
  };
  const patchPositions = (
    ids: Set<string>,
    patch: (item: ExtractedPosition) => ExtractedPosition,
  ) => patchWhere((item) => ids.has(item.id), patch);

  const reviewed = (review: ExtractedPosition["review"]) => (item: ExtractedPosition) => ({
    ...item,
    review,
    reviewedBy: currentUserId(),
  });

  /**
   * Список позиций перечитываем, только когда завершилась последняя мутация проверки: ответ на первое
   * из быстрых подтверждений вернул бы в список строки, решения по которым ещё в пути.
   * В onSettled мутация ещё считается выполняющейся, поэтому последняя — это «одна».
   */
  // Перечитывание не ждём: пока onSettled ждёт, мутация считается идущей, и следующая за ней
  // решила бы, что она не последняя, и пропустила бы перечитывание списка
  const settle = (areas: Area[]) => {
    void invalidate(
      queryClient,
      queryClient.isMutating({ mutationKey: REVIEW_MUTATION }) <= 1
        ? areas
        : areas.filter((area) => area !== "positions"),
    );
  };
  const failed = (error: Error, snapshot: Snapshot | undefined) => {
    rollback(queryClient, snapshot);
    notices.onFailed?.(error);
  };

  const confirm = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "confirmPositions" },
    mutationFn: (ids: string[]) => api.positions.confirm(ids),
    onMutate: (ids) => patchPositions(new Set(ids), reviewed("confirmed")),
    onError: (error, _ids, snapshot) => failed(error, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  /** «Подтвердить все проверенные»: какие позиции подтвердить, решает сервер */
  const confirmAutoVerified = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "confirmAutoVerified" },
    mutationFn: (revisionId: string) => api.positions.confirmAutoVerified(revisionId),
    onMutate: (revisionId) =>
      patchWhere(
        (item) =>
          item.documentId === revisionId &&
          item.review === "pending" &&
          confidenceBand(item.confidence) === "verified",
        reviewed("confirmed"),
      ),
    onError: (error, _revisionId, snapshot) => failed(error, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const correct = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "correctPosition" },
    mutationFn: (input: CorrectPositionInput) => api.positions.correct(input),
    onMutate: ({ id, ...patch }) =>
      patchPositions(new Set([id]), (item) => ({ ...reviewed("corrected")(item), ...patch })),
    onError: (error, _input, snapshot) => failed(error, snapshot),
    // Исправленное количество попадает в историю объекта
    onSettled: () => settle([...REVIEW_AREAS, "timeline"]),
  });

  const exclude = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "excludePosition" },
    mutationFn: (id: string) => api.positions.exclude(id),
    onMutate: (id) => patchPositions(new Set([id]), reviewed("excluded")),
    onError: (error, _id, snapshot) => failed(error, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const markHeader = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "markHeader" },
    mutationFn: (id: string) => api.positions.markHeader(id),
    onMutate: (id) => patchPositions(new Set([id]), reviewed("header")),
    onError: (error, _id, snapshot) => failed(error, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const reopen = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "reopenPosition" },
    mutationFn: (id: string) => api.positions.reopen(id),
    onMutate: (id) =>
      patchPositions(new Set([id]), (item) => ({
        ...item,
        review: "pending",
        reviewedBy: null,
        reviewedAt: null,
        mergedInto: null,
      })),
    onError: (error, _id, snapshot) => failed(error, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  /** Обратная мутация для «Отменить»: сервер возвращает прежнее решение и пишет отмену в журнал */
  const undoReview = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "undoReview" },
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
          reviewedBy: undo.to === "pending" ? null : currentUserId(),
        };
      });
    },
    onSuccess: (undone) => {
      if (undone === 0) notices.onNothingUndone?.();
    },
    onError: (error, _input, snapshot) => failed(error, snapshot),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const merge = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "mergePositions" },
    mutationFn: (input: MergePositionsInput) => api.positions.merge(input),
    onError: (error) => notices.onFailed?.(error),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const split = useMutation({
    mutationKey: REVIEW_MUTATION,
    meta: { action: "splitPosition" },
    mutationFn: (input: SplitPositionInput) => api.positions.split(input),
    onError: (error) => notices.onFailed?.(error),
    onSettled: () => settle(REVIEW_AREAS),
  });

  const handOver = useMutation({
    meta: { action: "handOver" },
    mutationFn: (revisionId: string) => api.positions.handOver(revisionId),
    onSettled: () => invalidate(queryClient, REVIEW_AREAS),
  });

  return {
    confirm,
    confirmAutoVerified,
    correct,
    exclude,
    markHeader,
    reopen,
    undoReview,
    merge,
    split,
    handOver,
  };
}

/** «Отменить» подтверждение позиций, которые до него были не проверены */
export function undoConfirmInput(ids: string[]) {
  return {
    items: ids.map((id) => ({ id, from: "confirmed" as const, to: "pending" as const })),
  } satisfies UndoReviewInput;
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
    meta: { action: "uploadDocument" },
    mutationFn: (input: UploadRevisionInput) => api.documents.upload(input),
    onSettled: () => invalidate(queryClient, ["documents", "positions", "projects", "timeline"]),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "createProject" },
    mutationFn: (input: CreateProjectInput) => api.projects.create(input),
    onSettled: () => invalidate(queryClient, ["projects", "directory"]),
  });
}

const PROCUREMENT_AREAS: Area[] = ["procurement", "positions", "projects", "timeline"];

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "createRequest" },
    mutationFn: (input: CreateRequestInput) => api.procurement.createRequest(input),
    onSettled: () => invalidate(queryClient, PROCUREMENT_AREAS),
  });
}

export function useRemindSuppliers() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "remindSuppliers" },
    mutationFn: (requestId: string) => api.procurement.remind(requestId),
    // Ответы на напоминание приходят позже событиями и обновляют свои области сами
    onSettled: () => invalidate(queryClient, ["procurement"]),
  });
}

export function useChooseSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "chooseSupplier" },
    mutationFn: (input: ChooseSupplierInput) => api.procurement.chooseSupplier(input),
    // reports: карточка источника показывает решения, принятые на его основании
    onSettled: () => invalidate(queryClient, [...PROCUREMENT_AREAS, "reports"]),
  });
}

/** Движение поставки до приёмки: отгружено, в пути, прибыло, отклонено (ADR-011) */
export function useMoveDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "moveDelivery" },
    mutationFn: (input: MoveDeliveryInput) => api.procurement.moveDelivery(input),
    onSettled: () => invalidate(queryClient, PROCUREMENT_AREAS),
  });
}

/** Закрыть замечание по поставке: уходит из очереди «Требует решения» */
export function useResolveRemark() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "resolveRemark" },
    mutationFn: (input: ResolveRemarkInput) => api.procurement.resolveRemark(input),
    onSettled: () => invalidate(queryClient, PROCUREMENT_AREAS),
  });
}

/** Акт приёмки: меняет поставку, позиции (поставлено, остаток), историю и очередь решений */
export function useAcceptDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "acceptDelivery" },
    mutationFn: (input: AcceptDeliveryInput) => api.procurement.acceptDelivery(input),
    onSettled: () => invalidate(queryClient, PROCUREMENT_AREAS),
  });
}

/** Подтвердить сопоставление позиции с материалом справочника (ADR-014) */
export function useConfirmMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "confirmMatch" },
    mutationFn: (input: ConfirmMatchInput) => api.positions.confirmMatch(input),
    onSettled: () => invalidate(queryClient, ["positions", "projects"]),
  });
}

/** Добавить или изменить материал номенклатуры (ADR-014) */
export function useSaveMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "saveMaterial" },
    mutationFn: (input: SaveMaterialInput) => api.catalog.saveMaterial(input),
    onSettled: () => invalidate(queryClient, ["positions", "procurement"]),
  });
}

export function useVerifyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "verifyContact" },
    mutationFn: (supplierId: string) => api.procurement.verifyContact(supplierId),
    onSettled: () => invalidate(queryClient, ["procurement"]),
  });
}

/** Категория дерева: создать, переименовать, перенести (ADR-023, п. 2) */
export function useSaveCategory(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "saveCategory" },
    mutationFn: (input: SaveCategoryInput) => api.catalog.saveCategory(input),
    onError: (error: Error) => notices.onFailed?.(error),
    onSettled: () => invalidate(queryClient, ["positions", "documents"]),
  });
}

/** Поставщик вместе с профилем подбора (ADR-023, п. 1) */
export function useSaveSupplier(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "saveSupplier" },
    mutationFn: (input: SaveSupplierInput) => api.catalog.saveSupplier(input),
    onError: (error: Error) => notices.onFailed?.(error),
    onSettled: () => invalidate(queryClient, ["procurement", "directory"]),
  });
}

/** Загрузка номенклатуры из файла (ADR-023, п. 3) */
export function useImportMaterials(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "importMaterials" },
    mutationFn: (input: ImportMaterialsInput) => api.catalog.importMaterials(input),
    onError: (error: Error) => notices.onFailed?.(error),
    onSettled: () => invalidate(queryClient, ["positions", "documents"]),
  });
}

/** Завести сотрудника или изменить его роль и объекты (ADR-021, п. 8) */
export function useSaveEmployee(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "saveEmployee" },
    mutationFn: (input: SaveEmployeeInput) => api.directory.saveEmployee(input),
    onError: (error: Error) => notices.onFailed?.(error),
    onSettled: () => invalidate(queryClient, ["directory", "projects"]),
  });
}

/** Завести отчёт руками, пока нет бота (ADR-022) */
export function useCreateReport(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "createReport" },
    mutationFn: (input: CreateReportInput) => api.reports.create(input),
    onError: (error: Error) => notices.onFailed?.(error),
    onSettled: () => invalidate(queryClient, ["reports", "timeline", "projects"]),
  });
}

export function useReviewReport(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "reviewReport" },
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
    onError: (error, _input, snapshot) => {
      rollback(queryClient, snapshot);
      notices.onFailed?.(error);
    },
    onSettled: () => invalidate(queryClient, ["reports"]),
  });
}

/** Сброс демо-данных: после него весь кеш запросов устарел */
export function useResetDemo() {
  const queryClient = useQueryClient();
  return async () => {
    await api.demo.reset();
    // Сбросить к исходному состоянию и перезапросить активные запросы: removeQueries отцепил бы их от кеша
    void queryClient.resetQueries();
  };
}

/** Вопрос ассистенту (ADR-006): ответ не кешируется — каждый вопрос считается заново */
export function useAskAgent() {
  return useMutation({
    meta: { action: "askAgent" },
    mutationFn: (input: AskAgentInput) => api.agent.ask(input),
  });
}

/* ---------- Статусы на экранах (ADR-015, п. 7) ---------- */

/** Статус объекта: реестр, карточка, дашборд и история */
export function useSetProjectStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "setProjectStatus" },
    mutationFn: (input: SetProjectStatusInput) => api.projects.setStatus(input),
    onSettled: () => invalidate(queryClient, ["projects", "timeline"]),
  });
}

/** Контрольная точка выполнена: карточка объекта и история */
export function useCompleteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "completeMilestone" },
    mutationFn: (input: CompleteMilestoneInput) => api.projects.completeMilestone(input),
    onSettled: () => invalidate(queryClient, ["projects", "timeline"]),
  });
}

/** Позиция заведена руками (ADR-025): список проверки, счётчики, история */
export function useCreatePosition(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "createPosition" },
    mutationFn: (input: CreatePositionInput) => api.positions.create(input),
    onError: (error: Error) => notices.onFailed?.(error),
    onSettled: () => invalidate(queryClient, ["positions", "documents", "projects"]),
  });
}

/** Спецификация загружена пачкой из файла (ADR-025, п. 2) */
export function useImportSpec(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "importSpec" },
    mutationFn: (input: ImportSpecInput) => api.positions.importSpec(input),
    onError: (error: Error) => notices.onFailed?.(error),
    onSettled: () => invalidate(queryClient, ["positions", "documents", "projects"]),
  });
}

/** Захватка заведена или изменена (ADR-024): ход работ, карточка объекта, история */
export function useSaveZone(notices: Pick<MutationNotices, "onFailed"> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "saveZone" },
    mutationFn: (input: SaveZoneInput) => api.projects.saveZone(input),
    onError: (error: Error) => notices.onFailed?.(error),
    onSettled: () => invalidate(queryClient, ["projects", "timeline", "reports"]),
  });
}

/** Изменение ревизии разобрано: счётчики реестра и карточки, список изменений, история */
export function useResolveChange() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { action: "resolveChange" },
    mutationFn: (input: ResolveChangeInput) => api.documents.resolveChange(input),
    onSettled: () => invalidate(queryClient, ["documents", "projects", "timeline"]),
  });
}
