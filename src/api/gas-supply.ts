/**
 * Слой данных снабжения (ADR-057). Экраны берут отсюда готовые строки, подписи и действия:
 * формулы лимита, сравнения и приёмки живут в domain, порт — ниже этого слоя.
 */
import { useCallback, useMemo } from "react";
import {
  AWAITING_RECEIPT,
  PRIORITY_LABEL,
  RECEIPT_RESULT_LABEL,
  RFQ_HEADERS,
  SUPPLY_STATUS_LABEL,
  acceptedMaterials,
  compareOffers,
  fmtKop,
  fmtQty,
  isOverdue,
  itemOf,
  limitCheck,
  limitText,
  orderTotalKop,
  parseRequestText,
  receivedOf,
  requestLimit,
  rfqFileName,
  rfqRows,
  rfqText,
  siteRequests,
  sortRequests,
  supplyMetrics,
  supplyOverview,
  type AcceptedMaterial,
  type DraftLine,
  type LimitCheck,
  type NomenclatureItem,
  type Offer,
  type OfferRow,
  type Receipt,
  type RequestDraft,
  type SiteRequest,
  type Supplier,
  type SupplyMetrics,
  type SupplyOverview,
  type SupplyPriority,
  type SupplyRequest,
  type SupplyStatus,
} from "@/domain/gas-ops/supply";
import type { WorkObject } from "@/domain/gas-ops/model";
import { actorOf } from "@/domain/gas-ops/view";
import { useGasSnapshot, useGasSupplyPort } from "@/lib/gas-ops/use-gas-ops";
import { saveFile } from "@/lib/download";
import { fileNameFromDisposition } from "@/lib/gas-ops/export";
import type {
  AcceptDeliveryInput,
  AddOfferInput,
  AddSupplierInput,
  CreateRequestInput,
  GasSupplyPort,
} from "@/ports/gas-supply";
import type { ActionResult } from "./gas-ops";

export {
  AWAITING_RECEIPT,
  PRIORITY_LABEL,
  RECEIPT_RESULT_LABEL,
  SUPPLY_STATUS_LABEL,
  fmtKop,
  fmtQty,
};
export type {
  AcceptedMaterial,
  DraftLine,
  LimitCheck,
  NomenclatureItem,
  Offer,
  OfferRow,
  Receipt,
  RequestDraft,
  SiteRequest,
  Supplier,
  SupplyMetrics,
  SupplyOverview,
  SupplyPriority,
  SupplyRequest,
  SupplyStatus,
};

/** Объекты, которые видит человек: прорабу только свои (инвариант 5) */
function visibleObjects(snapshot: ReturnType<typeof useGasSnapshot>): WorkObject[] {
  const user = actorOf(snapshot);
  if (!user || user.allowedObjectIds === "all") return snapshot.objects;
  const ids = new Set(user.allowedObjectIds);
  return snapshot.objects.filter((o) => ids.has(o.id));
}

export interface SupplyBase {
  today: string;
  items: NomenclatureItem[];
  suppliers: Supplier[];
  objects: WorkObject[];
  itemName: (id: string) => string;
  itemUnit: (id: string) => string;
  objectLabel: (id: string) => string;
}

export function useSupplyBase(): SupplyBase {
  const snapshot = useGasSnapshot();
  return useMemo(() => {
    const { items, suppliers } = snapshot.supply;
    const objects = visibleObjects(snapshot);
    return {
      today: snapshot.today,
      items,
      suppliers,
      objects,
      itemName: (id) => itemOf(items, id)?.name ?? "Позиция не найдена",
      itemUnit: (id) => itemOf(items, id)?.unit ?? "",
      objectLabel: (id) => {
        const o = snapshot.objects.find((x) => x.id === id);
        return o ? `${o.code} · ${o.label}` : "Объект не найден";
      },
    };
  }, [snapshot]);
}

/** Разбор текста или расшифровки голоса в черновик строк: правила, без модели */
export function useRequestDraft(): (text: string) => RequestDraft {
  const snapshot = useGasSnapshot();
  return useCallback(
    (text) => parseRequestText(text, snapshot.supply.items, snapshot.today),
    [snapshot.supply.items, snapshot.today],
  );
}

/** Сверка строки черновика или заявки с лимитом сметы объекта */
export function useLimitCheck(): (input: {
  objectId: string;
  itemId: string;
  qty: number;
  requestId?: string | null;
}) => { check: LimitCheck; text: string } {
  const snapshot = useGasSnapshot();
  return useCallback(
    (input) => {
      const check = limitCheck({
        ...input,
        limits: snapshot.supply.limits,
        requests: snapshot.supply.requests,
      });
      const unit = itemOf(snapshot.supply.items, input.itemId)?.unit ?? "";
      return { check, text: limitText(check, unit) };
    },
    [snapshot.supply],
  );
}

export interface RequestRow {
  request: SupplyRequest;
  objectLabel: string;
  summary: string;
  overdue: boolean;
  orderKop: number | null;
}

/** Таблица «Заявки»: по сроку и приоритету, с фильтрами объекта и статуса */
export function useSupplyRequests(filter: {
  objectId: string | null;
  status: SupplyStatus | "all" | "active";
}): { rows: RequestRow[]; metrics: SupplyMetrics; total: number } {
  const snapshot = useGasSnapshot();
  const base = useSupplyBase();
  return useMemo(() => {
    const visible = new Set(base.objects.map((o) => o.id));
    const all = snapshot.supply.requests.filter((r) => visible.has(r.objectId));
    const filtered = all.filter(
      (r) =>
        (!filter.objectId || r.objectId === filter.objectId) &&
        (filter.status === "all" ||
          (filter.status === "active"
            ? !["closed", "rejected"].includes(r.status)
            : r.status === filter.status)),
    );
    const rows = sortRequests(filtered).map((request) => ({
      request,
      objectLabel: base.objectLabel(request.objectId),
      summary: request.lines
        .map((l) => `${base.itemName(l.itemId)}: ${fmtQty(l.qty)} ${base.itemUnit(l.itemId)}`)
        .join("; "),
      overdue: isOverdue(request, snapshot.today),
      orderKop: orderTotalKop(request, snapshot.supply.offers),
    }));
    return { rows, metrics: supplyMetrics(all, snapshot.today), total: all.length };
  }, [snapshot, base, filter.objectId, filter.status]);
}

export interface RequestLineView {
  id: string;
  itemId: string;
  name: string;
  unit: string;
  qty: number;
  received: number;
  limit: { check: LimitCheck; text: string };
}

export interface RequestDetail {
  request: SupplyRequest;
  objectLabel: string;
  overdue: boolean;
  lines: RequestLineView[];
  offers: OfferRow[];
  supplierName: (id: string) => string;
  receipts: Receipt[];
  rfqText: string;
  orderKop: number | null;
}

export function useSupplyRequest(id: string): RequestDetail | null {
  const snapshot = useGasSnapshot();
  const base = useSupplyBase();
  return useMemo(() => {
    const request = snapshot.supply.requests.find((r) => r.id === id);
    if (!request || !base.objects.some((o) => o.id === request.objectId)) return null;
    const got = receivedOf(request, snapshot.supply.receipts);
    return {
      request,
      objectLabel: base.objectLabel(request.objectId),
      overdue: isOverdue(request, snapshot.today),
      lines: request.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        name: base.itemName(l.itemId),
        unit: base.itemUnit(l.itemId),
        qty: l.qty,
        received: got.get(l.id) ?? 0,
        limit: (() => {
          const check = requestLimit(snapshot.supply, request, l.itemId, l.qty);
          return { check, text: limitText(check, base.itemUnit(l.itemId)) };
        })(),
      })),
      offers: compareOffers(request, snapshot.supply.offers),
      supplierName: (sid) =>
        snapshot.supply.suppliers.find((s) => s.id === sid)?.name ?? "Поставщик",
      receipts: snapshot.supply.receipts.filter((r) => r.requestId === request.id),
      rfqText: rfqText(request, {
        objectLabel: base.objectLabel(request.objectId),
        items: base.items,
      }),
      orderKop: orderTotalKop(request, snapshot.supply.offers),
    };
  }, [snapshot, base, id]);
}

/** Выборка прораба: свои объекты, статусы и сроки, без цен (ADR-057, 3) */
export function useSiteRequests(): SiteRequest[] {
  const snapshot = useGasSnapshot();
  return useMemo(() => {
    const user = actorOf(snapshot);
    const ids = !user || user.allowedObjectIds === "all" ? "all" : new Set(user.allowedObjectIds);
    return siteRequests(snapshot.supply, ids);
  }, [snapshot]);
}

export interface SupplierView {
  supplier: Supplier;
  offers: { offer: Offer; number: string; totalKop: number | null; chosen: boolean }[];
  avgLeadDays: number | null;
}

export function useSupplierList(): SupplierView[] {
  const snapshot = useGasSnapshot();
  return useMemo(
    () =>
      snapshot.supply.suppliers.map((supplier) => {
        const offers = snapshot.supply.offers
          .filter((o) => o.supplierId === supplier.id)
          .map((offer) => {
            const request = snapshot.supply.requests.find((r) => r.id === offer.requestId)!;
            const row = compareOffers(request, [offer])[0]!;
            return {
              offer,
              number: request.number,
              totalKop: row.totalKop,
              chosen: request.chosenOfferId === offer.id,
            };
          });
        const avgLeadDays = offers.length
          ? Math.round((offers.reduce((a, o) => a + o.offer.leadDays, 0) / offers.length) * 10) / 10
          : null;
        return { supplier, offers, avgLeadDays };
      }),
    [snapshot],
  );
}

export function useSupplyOverview(): SupplyOverview {
  const snapshot = useGasSnapshot();
  return useMemo(() => supplyOverview(snapshot.supply, snapshot.today), [snapshot]);
}

/** Материалы для ПТО: принятые на объектах, с сертификатами (связь с модулем 3) */
export function useAcceptedMaterials(): AcceptedMaterial[] {
  const snapshot = useGasSnapshot();
  const base = useSupplyBase();
  return useMemo(
    () => acceptedMaterials(snapshot.supply, new Set(base.objects.map((o) => o.id))),
    [snapshot, base],
  );
}

export interface SupplyActor {
  canCreate: boolean;
  canDecide: boolean;
  canAccept: boolean;
}

export function useSupplyActor(): SupplyActor {
  const snapshot = useGasSnapshot();
  const role = actorOf(snapshot)?.role ?? "manager";
  return {
    canCreate: role === "prorab" || role === "supply" || role === "admin",
    canDecide: role === "supply" || role === "admin",
    canAccept: role === "prorab" || role === "supply" || role === "admin",
  };
}

function useRun(): <T>(run: (port: GasSupplyPort) => Promise<T>) => Promise<ActionResult<T>> {
  const port = useGasSupplyPort();
  return useCallback(
    async (run) => {
      try {
        return { ok: true, value: await run(port) };
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
        const message =
          error instanceof Error ? error.message : "Действие не выполнено. Повторите.";
        return { ok: false, code, message };
      }
    },
    [port],
  );
}

export function useSupplyActions() {
  const run = useRun();
  return useMemo(
    () => ({
      createRequest: (input: CreateRequestInput) => run((p) => p.createRequest(input)),
      moveRequest: (input: { id: string; to: "in-work" | "waiting-offers" | "closed" }) =>
        run((p) => p.moveRequest(input)),
      rejectRequest: (input: { id: string; reason: string }) => run((p) => p.rejectRequest(input)),
      addOffer: (input: AddOfferInput) => run((p) => p.addOffer(input)),
      chooseOffer: (input: { requestId: string; offerId: string }) =>
        run((p) => p.chooseOffer(input)),
      markOrdered: (input: { requestId: string }) => run((p) => p.markOrdered(input)),
      markInTransit: (input: { requestId: string; eta: string }) =>
        run((p) => p.markInTransit(input)),
      acceptDelivery: (input: AcceptDeliveryInput) => run((p) => p.acceptDelivery(input)),
      addSupplier: (input: AddSupplierInput) => run((p) => p.addSupplier(input)),
    }),
    [run],
  );
}

/** Файл запроса цены: собирается на сервере, как недельный отчёт */
export function useRfqDownload(): (detail: RequestDetail) => Promise<string> {
  const base = useSupplyBase();
  return useCallback(
    async (detail) => {
      const body = {
        number: detail.request.number,
        objectLabel: detail.objectLabel,
        needBy: detail.request.needBy,
        headers: [...RFQ_HEADERS],
        rows: rfqRows(detail.request, base.items),
      };
      const response = await fetch("/api/gas/rfq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Сервер ответил ${response.status}`);
      const name =
        fileNameFromDisposition(response.headers.get("content-disposition")) ??
        rfqFileName(detail.request);
      saveFile(await response.blob(), name);
      return name;
    },
    [base.items],
  );
}
