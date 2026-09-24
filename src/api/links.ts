import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  deliveryLinks,
  positionLinks,
  positionOrigin,
  reportLinks,
  requestLinks,
} from "@/domain/links";
import type { DeliveryCard, ExtractedPosition } from "@/contracts";
import type { EntityLink } from "./types";
import { queries } from "./queries";
import { useAccess } from "./access";

/**
 * Связи между сущностями для экранов (ADR-018). Формулы и правила — в `domain/links`,
 * здесь только данные: какие запросы и поставки нужно прочитать и какие разделы открыты роли.
 *
 * Связь на закрытый роли раздел не предлагается: ссылка, которая приведёт на «Нет доступа», —
 * это тупик, а не связь.
 */

/** Связи позиции: запросы, в которые она вошла, и поставка, которой её привезли */
export function usePositionLinks(position: ExtractedPosition): EntityLink[] {
  const { can } = useAccess();
  const seesProcurement = can("procurement");
  const seesDeliveries = can("deliveries");
  const requests = useQuery({
    ...queries.requests(position.projectId),
    enabled: seesProcurement,
  }).data;
  const deliveries = useQuery({
    ...queries.deliveries(position.projectId),
    enabled: seesDeliveries,
  }).data;
  return useMemo(
    () =>
      positionLinks({
        position,
        requests: seesProcurement ? (requests ?? []) : [],
        deliveries: seesDeliveries ? (deliveries ?? []) : [],
      }),
    [position, requests, deliveries, seesProcurement, seesDeliveries],
  );
}

/** Происхождение позиции: документ, лист, номер — одной строкой до места в оригинале */
export function usePositionOrigin(position: ExtractedPosition, documentTitle: string) {
  const { can } = useAccess();
  const seesDocuments = can("documents");
  return useMemo(
    () => (seesDocuments ? positionOrigin(position, documentTitle) : null),
    [position, documentTitle, seesDocuments],
  );
}

/** Связи поставки: запрос с решением и материалы её состава */
export function useDeliveryLinks(card: DeliveryCard, projectId: string): EntityLink[] {
  const { can } = useAccess();
  const seesProcurement = can("procurement");
  const seesMaterials = can("materials");
  return useMemo(() => {
    const all = deliveryLinks({ card, projectId });
    return all.filter((link) =>
      link.to.includes("/materials")
        ? seesMaterials
        : link.to.includes("/procurement")
          ? seesProcurement
          : true,
    );
  }, [card, projectId, seesProcurement, seesMaterials]);
}

/** Связи запроса: позиции, из которых он собран, и поставка по решению */
export function useRequestLinks(
  request: { id: string; items: { name: string }[] },
  projectId: string,
): EntityLink[] {
  const { can } = useAccess();
  const seesMaterials = can("materials");
  const seesDeliveries = can("deliveries");
  const deliveries = useQuery({ ...queries.deliveries(projectId), enabled: seesDeliveries }).data;
  return useMemo(() => {
    const all = requestLinks({
      request,
      deliveries: seesDeliveries ? (deliveries ?? []) : [],
      projectId,
    });
    return all.filter((link) => (link.to.includes("/materials") ? seesMaterials : true));
  }, [request, deliveries, projectId, seesMaterials, seesDeliveries]);
}

/** Связи отчёта с площадки: захватка в ходе работ */
export function useReportLinks(projectId: string, zoneName: string | null): EntityLink[] {
  return useMemo(() => reportLinks({ projectId, zoneName }), [projectId, zoneName]);
}
