import type { Delivery, DeliveryCard, ExtractedPosition } from "@/contracts";
import type { RequestSummary } from "@/ports";
import type { SupplyRequest } from "@/contracts";

/**
 * Связи между сущностями (ADR-018). Считаются здесь, из того, что уже отдают порты:
 * у позиции есть документ, лист, номер, запросы и поставленное количество; у поставки — запрос.
 *
 * Правило одно: **связь показывается, только если она есть в данных**. Нет запроса — нет строки;
 * пустая строка «—» в блоке «Связано» хуже отсутствующей, потому что обещает переход в никуда.
 */

export interface EntityLink {
  /** Что это: «Запрос», «Поставка», «Документ» */
  label: string;
  /** Название: номер запроса, имя документа */
  title: string;
  /** Куда ведёт: путь без параметров запроса */
  to: string;
  /** Параметры экрана: фильтр реестра, открытая панель */
  search?: Record<string, string>;
  /** Чем эта связь полезна: «решение зафиксировано», «принята 30.08» */
  hint?: string;
}

/** Шаг происхождения: откуда значение взялось. Вся цепочка ведёт в одно место */
export interface OriginStep {
  label: string;
  value: string;
}

const projectPath = (projectId: string, tail: string) => `/projects/${projectId}${tail}`;

/**
 * Происхождение позиции: документ → лист → номер позиции в листе.
 * Ведёт на экран проверки с раскрытой позицией — туда, где она стоит в оригинале.
 */
export function positionOrigin(
  position: Pick<ExtractedPosition, "id" | "projectId" | "documentId" | "sheetNumber" | "position">,
  documentTitle: string,
): { steps: OriginStep[]; to: string; search: Record<string, string> } {
  return {
    steps: [
      { label: "Документ", value: documentTitle },
      { label: "Лист", value: String(position.sheetNumber) },
      { label: "Позиция", value: position.position },
    ],
    to: projectPath(position.projectId, `/documents/${position.documentId}`),
    search: { position: position.id },
  };
}

/**
 * Связи позиции (карточка материала): запросы, в которые она вошла, и поставка,
 * которой её привезли. Поставка ищется по запросу — другой связи в данных нет.
 */
export function positionLinks({
  position,
  requests,
  deliveries,
}: {
  position: Pick<ExtractedPosition, "projectId" | "requestIds" | "materialId" | "deliveredQty">;
  requests: RequestSummary[];
  deliveries: Delivery[];
}): EntityLink[] {
  const links: EntityLink[] = [];
  const mine = requests.filter((item) => position.requestIds.includes(item.request.id));

  for (const summary of mine) {
    links.push({
      label: "Запрос поставщикам",
      title: summary.request.number,
      to: projectPath(position.projectId, `/procurement/${summary.request.id}`),
      ...(summary.answered > 0
        ? { hint: `предложений: ${summary.answered}` }
        : { hint: "ответов пока нет" }),
    });
  }

  const requestIds = new Set(mine.map((item) => item.request.id));
  for (const delivery of deliveries) {
    if (!requestIds.has(delivery.requestId)) continue;
    // Поставка связана с позицией через запрос; если в её составе этой позиции нет, связи нет
    const carried = position.materialId
      ? delivery.items.some((item) => item.materialId === position.materialId)
      : false;
    if (!carried) continue;
    links.push({
      label: "Поставка",
      title: delivery.items.map((item) => item.name).join(", "),
      to: projectPath(position.projectId, "/deliveries"),
      search: { delivery: delivery.id },
      hint: deliveryHint(delivery.status, delivery.receivedAt),
    });
  }

  return links;
}

function deliveryHint(status: string, receivedAt: string | null) {
  if (receivedAt) return `принята ${receivedAt.slice(8, 10)}.${receivedAt.slice(5, 7)}`;
  return status === "in_transit" ? "в пути" : "ожидается";
}

/**
 * Связи поставки: материалы её состава в реестре. Запрос уже стоит ссылкой в шапке панели,
 * акт и замечания — там же ниже: повторять их в «Связано» значит показывать одно дважды.
 */
export function deliveryLinks({
  card,
  projectId,
}: {
  card: Pick<DeliveryCard, "delivery">;
  projectId: string;
}): EntityLink[] {
  const links: EntityLink[] = [];

  const materials = card.delivery.items.filter((item) => item.materialId);
  if (materials.length) {
    links.push({
      label: materials.length === 1 ? "Материал в реестре" : "Материалы в реестре",
      title: materials.map((item) => item.name).join(", "),
      to: projectPath(projectId, "/materials"),
      search: { purchase: "ordered" },
      hint: "позиции, по которым шла закупка",
    });
  }

  return links;
}

/** Связи запроса: позиции, из которых он собран, и поставка, если решение уже принято */
export function requestLinks({
  request,
  deliveries,
  projectId,
}: {
  request: Pick<SupplyRequest, "id"> & { items: { name: string }[] };
  deliveries: Delivery[];
  projectId: string;
}): EntityLink[] {
  const links: EntityLink[] = [];
  const names = request.items.map((item) => item.name).filter(Boolean);
  if (names.length) {
    links.push({
      label: names.length === 1 ? "Позиция запроса" : "Позиции запроса",
      title: names.join(", "),
      to: projectPath(projectId, "/materials"),
      search: { purchase: "requested" },
      hint: "в реестре материалов",
    });
  }

  const delivery = deliveries.find((item) => item.requestId === request.id);
  if (delivery) {
    links.push({
      label: "Поставка по решению",
      title: delivery.items.map((item) => item.name).join(", "),
      to: projectPath(projectId, "/deliveries"),
      search: { delivery: delivery.id },
      hint: deliveryHint(delivery.status, delivery.receivedAt),
    });
  }

  return links;
}

/**
 * Связи отчёта с площадки: захватка, объём которой он меняет. Объект и автор видны в самой
 * карточке отчёта, поэтому ссылками не повторяются.
 */
export function reportLinks({
  projectId,
  zoneName,
}: {
  projectId: string;
  zoneName: string | null;
}): EntityLink[] {
  if (!zoneName) return [];
  return [
    {
      label: "Захватка в ходе работ",
      title: zoneName,
      to: projectPath(projectId, ""),
      search: { tab: "progress" },
      hint: "план, факт и отклонение",
    },
  ];
}
