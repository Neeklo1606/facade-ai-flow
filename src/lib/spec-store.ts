import { useSyncExternalStore } from "react";
import {
  extractedPositions,
  positionChanges,
  projectDocuments,
  simulatedPositions,
  supplyRequests,
  type ExtractedPosition,
  type PositionChange,
  type ProjectDocument,
  type SupplyRequest,
} from "@/mock/repository";

/**
 * Клиентское состояние цепочки «документ → позиции → закупка».
 * Стартует с моков репозитория; экраны читают только отсюда, чтобы решение
 * на экране извлечения сразу было видно в материалах, карточке и реестре.
 * Потом этот слой заменяется запросами к API без изменения экранов.
 */

export interface UploadProgress {
  /** Индекс пройденной стадии обработки, 0…4 */
  stage: number;
}

export interface SpecState {
  documents: ProjectDocument[];
  positions: ExtractedPosition[];
  changes: PositionChange[];
  uploads: Record<string, UploadProgress>;
  requests: SupplyRequest[];
  /** Документы, чьи проверенные позиции переданы в закупку */
  sentDocuments: Record<string, string>;
}

const ACTOR = "e-sokolov";

let state: SpecState = {
  documents: projectDocuments,
  positions: extractedPositions,
  changes: positionChanges,
  uploads: {},
  requests: supplyRequests,
  sentDocuments: {},
};

const listeners = new Set<() => void>();

function set(next: (prev: SpecState) => SpecState) {
  state = next(state);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

/** Текущее состояние вне React — для действий и проверок. */
export const getSpecState = getSnapshot;

export function useSpecStore<T>(selector: (s: SpecState) => T): T {
  return selector(useSyncExternalStore(subscribe, getSnapshot, getSnapshot));
}

/** Локальное время без часового пояса — в том же формате, что даты в моках. */
function now() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

let changeSeq = 0;
function change(
  positionId: string,
  action: string,
  before: string | null = null,
  after: string | null = null,
): PositionChange {
  changeSeq += 1;
  return {
    id: `pc-live-${changeSeq}`,
    positionId,
    at: now(),
    actorId: ACTOR,
    action,
    before,
    after,
  };
}

function patchPositions(
  ids: Set<string>,
  patch: (item: ExtractedPosition) => ExtractedPosition,
  changes: PositionChange[],
) {
  set((prev) => ({
    ...prev,
    positions: prev.positions.map((item) => (ids.has(item.id) ? patch(item) : item)),
    changes: [...prev.changes, ...changes],
  }));
}

/* ---------- Решения по позициям ---------- */

export function isActive(item: ExtractedPosition) {
  return item.review !== "excluded" && item.review !== "merged" && item.review !== "header";
}

export function isVerified(item: ExtractedPosition) {
  return item.review === "confirmed" || item.review === "corrected";
}

export const specActions = {
  confirm(ids: string[]) {
    const targets = new Set(ids);
    const snapshot = state.positions.filter(
      (item) => targets.has(item.id) && item.review === "pending",
    );
    const at = now();
    patchPositions(
      new Set(snapshot.map((item) => item.id)),
      (item) => ({ ...item, review: "confirmed", reviewedBy: ACTOR, reviewedAt: at }),
      snapshot.map((item) => change(item.id, "Подтверждено")),
    );
    return snapshot.map((item) => item.id);
  },

  correct(
    id: string,
    patch: Pick<ExtractedPosition, "projectName" | "qty" | "unit" | "characteristics">,
  ) {
    const item = state.positions.find((p) => p.id === id);
    if (!item) return;
    const changes: PositionChange[] = [];
    if (item.qty !== patch.qty || item.unit !== patch.unit) {
      changes.push(
        change(
          id,
          "Исправлено количество",
          `${item.qty} ${item.unit}`,
          `${patch.qty} ${patch.unit}`,
        ),
      );
    }
    if (item.projectName !== patch.projectName) {
      changes.push(change(id, "Исправлено наименование", item.projectName, patch.projectName));
    }
    const chars = (list: ExtractedPosition["characteristics"]) =>
      list.map((c) => `${c.label}: ${c.value}`).join("; ");
    if (chars(item.characteristics) !== chars(patch.characteristics)) {
      changes.push(
        change(
          id,
          "Исправлены характеристики",
          chars(item.characteristics) || "—",
          chars(patch.characteristics) || "—",
        ),
      );
    }
    patchPositions(
      new Set([id]),
      (p) => ({
        ...p,
        ...patch,
        review: "corrected",
        reviewedBy: ACTOR,
        reviewedAt: now(),
        confidence: Math.max(p.confidence, 0.85),
      }),
      changes.length ? changes : [change(id, "Подтверждено с правкой")],
    );
  },

  exclude(id: string) {
    patchPositions(
      new Set([id]),
      (p) => ({ ...p, review: "excluded", reviewedBy: ACTOR, reviewedAt: now() }),
      [change(id, "Исключено из спецификации")],
    );
  },

  markHeader(id: string) {
    patchPositions(
      new Set([id]),
      (p) => ({ ...p, review: "header", reviewedBy: ACTOR, reviewedAt: now() }),
      [change(id, "Отмечено как заголовок раздела")],
    );
  },

  /** Вернуть исключённую, объединённую или заголовок обратно на проверку. */
  reopen(id: string) {
    const item = state.positions.find((p) => p.id === id);
    if (!item) return;
    patchPositions(
      new Set([id]),
      (p) => ({ ...p, review: "pending", reviewedBy: null, reviewedAt: null, mergedInto: null }),
      [change(id, "Возвращено на проверку")],
    );
  },

  /** Вернуть позицию к исходному состоянию — для «Отменить» в уведомлении. */
  restore(items: ExtractedPosition[]) {
    const byId = new Map(items.map((item) => [item.id, item]));
    set((prev) => ({
      ...prev,
      positions: prev.positions.map((item) => byId.get(item.id) ?? item),
    }));
  },

  merge(sourceId: string, targetId: string) {
    const source = state.positions.find((p) => p.id === sourceId);
    const target = state.positions.find((p) => p.id === targetId);
    if (!source || !target) return false;
    const sameUnit = source.unit === target.unit;
    set((prev) => ({
      ...prev,
      positions: prev.positions.map((item) => {
        if (item.id === sourceId)
          return {
            ...item,
            review: "merged",
            mergedInto: targetId,
            reviewedBy: ACTOR,
            reviewedAt: now(),
          };
        if (item.id === targetId && sameUnit) return { ...item, qty: item.qty + source.qty };
        return item;
      }),
      changes: [
        ...prev.changes,
        change(sourceId, `Объединено с поз. ${target.position}`),
        change(
          targetId,
          `Присоединена поз. ${source.position}`,
          `${target.qty} ${target.unit}`,
          sameUnit ? `${target.qty + source.qty} ${target.unit}` : `${target.qty} ${target.unit}`,
        ),
      ],
    }));
    return sameUnit;
  },

  split(id: string, firstQty: number) {
    const item = state.positions.find((p) => p.id === id);
    if (!item || firstQty <= 0 || firstQty >= item.qty) return;
    const secondQty = item.qty - firstQty;
    const copy: ExtractedPosition = {
      ...item,
      id: `${item.id}-split`,
      position: `${item.position}.2`,
      qty: secondQty,
      review: "pending",
      reviewedBy: null,
      reviewedAt: null,
      purchase: "none",
      requestIds: [],
    };
    set((prev) => {
      const index = prev.positions.findIndex((p) => p.id === id);
      const positions = [...prev.positions];
      positions[index] = { ...item, position: `${item.position}.1`, qty: firstQty };
      positions.splice(index + 1, 0, copy);
      return {
        ...prev,
        positions,
        changes: [
          ...prev.changes,
          change(
            id,
            "Разделена на две позиции",
            `${item.qty} ${item.unit}`,
            `${firstQty} + ${secondQty} ${item.unit}`,
          ),
        ],
      };
    });
  },

  sendToProcurement(documentId: string) {
    set((prev) => ({ ...prev, sentDocuments: { ...prev.sentDocuments, [documentId]: now() } }));
  },

  /* ---------- Закупка ---------- */

  createRequest(projectId: string, ids: string[], supplierIds: string[]) {
    const wanted = new Set(ids);
    const targets = state.positions.filter(
      (item) => wanted.has(item.id) && isVerified(item) && item.purchase === "none",
    );
    if (!targets.length) return null;
    const number = `З-2026/${326 + state.requests.filter((r) => r.id.startsWith("sr-live")).length}`;
    const request: SupplyRequest = {
      id: `sr-live-${Date.now()}`,
      number,
      projectId,
      zoneId: null,
      createdAt: now(),
      authorId: ACTOR,
      items: targets.map((item) => ({
        materialId: item.family,
        name: item.normalizedName ?? item.projectName,
        qty: item.qty,
        unit: item.unit,
      })),
      sentTo: supplierIds,
      status: "sent",
      sourceId: null,
    };
    const targetIds = new Set(targets.map((item) => item.id));
    set((prev) => ({
      ...prev,
      requests: [request, ...prev.requests],
      positions: prev.positions.map((item) =>
        targetIds.has(item.id)
          ? { ...item, purchase: "requested", requestIds: [...item.requestIds, request.id] }
          : item,
      ),
      changes: [
        ...prev.changes,
        ...targets.map((item) => change(item.id, `Добавлено в запрос ${number}`)),
      ],
    }));
    return { request, count: targets.length };
  },

  /* ---------- Загрузка ---------- */

  upload(projectId: string, file: { name: string; size: number }) {
    const id = `pd-live-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const ext = file.name.split(".").pop()?.toLowerCase();
    const fileType: ProjectDocument["fileType"] =
      ext === "docx" ? "docx" : ext === "xlsx" ? "xlsx" : "pdf";
    const doc: ProjectDocument = {
      id,
      projectId,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
      section: /ар/i.test(file.name) ? "АР" : /км/i.test(file.name) ? "КМ" : "НВФ",
      version: "Рев. 1",
      fileName: file.name,
      fileType,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      uploadedAt: now(),
      uploadedBy: ACTOR,
      sheetCount: fileType === "xlsx" ? 1 : 1 + Math.round(file.size / 180_000) || 1,
      status: "uploaded",
      sourceId: null,
    };
    set((prev) => ({
      ...prev,
      documents: [doc, ...prev.documents],
      uploads: { ...prev.uploads, [id]: { stage: 0 } },
    }));

    const statusByStage: ProjectDocument["status"][] = [
      "uploaded",
      "recognizing",
      "recognizing",
      "extracted",
      "review",
    ];
    for (let stage = 1; stage <= 4; stage++) {
      setTimeout(() => {
        set((prev) => ({
          ...prev,
          uploads: { ...prev.uploads, [id]: { stage } },
          documents: prev.documents.map((item) =>
            item.id === id ? { ...item, status: statusByStage[stage]! } : item,
          ),
          positions:
            stage === 3
              ? [...prev.positions, ...simulatedPositions(id, projectId, 36)]
              : prev.positions,
        }));
      }, stage * 1400);
    }
    return id;
  },
};

/* ---------- Селекторы ---------- */

export function documentStats(s: SpecState, documentId: string) {
  const items = s.positions.filter((item) => item.documentId === documentId && isActive(item));
  return {
    extracted: items.length,
    verified: items.filter(isVerified).length,
  };
}

/** Сводные цифры спецификации объекта; null — если позиций в системе нет. */
export function projectSpecStats(s: SpecState, projectId: string) {
  const items = s.positions.filter((item) => item.projectId === projectId && isActive(item));
  if (!items.length) return null;
  const verified = items.filter(isVerified);
  const count = (statuses: ExtractedPosition["purchase"][]) =>
    verified.filter((item) => statuses.includes(item.purchase)).length;
  return {
    specTotal: items.length,
    specUnverified: items.length - verified.length,
    inRequests: count(["requested", "offers", "supplier_selected", "ordered", "delivered"]),
    offersReceived: count(["offers", "supplier_selected", "ordered", "delivered"]),
    ordered: count(["ordered", "delivered"]),
    inTransit: count(["ordered"]),
    delivered: count(["delivered"]),
  };
}
