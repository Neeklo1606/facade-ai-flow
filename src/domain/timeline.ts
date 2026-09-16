import type { ProjectDecisionRow, ProjectEvent, SupplyRequest, TimelineEvent } from "@/contracts";

/** Ссылка на раздел для решения: строится из ссылок на запрос, отчёт или семейство материала */
export function decisionLink(
  decision: Pick<ProjectDecisionRow, "projectId" | "kind" | "requestId" | "reportId">,
  requests: Pick<SupplyRequest, "id" | "number">[],
) {
  const base = `/projects/${decision.projectId}`;
  if (decision.requestId) {
    const number = requests.find((item) => item.id === decision.requestId)?.number;
    return {
      to: `${base}/procurement/${decision.requestId}`,
      label: `Запрос ${number ?? ""}`.trim(),
    };
  }
  if (decision.reportId) return { to: `${base}/field-reports`, label: "Отчёт с площадки" };
  if (decision.kind === "replacement") return { to: `${base}/materials`, label: "Материалы" };
  return null;
}

/** Ссылка на раздел для события журнала */
export function eventLink(event: ProjectEvent, requests: Pick<SupplyRequest, "id" | "number">[]) {
  const base = `/projects/${event.projectId}`;
  if (event.requestId) {
    const number = requests.find((item) => item.id === event.requestId)?.number;
    return event.type === "offer_received"
      ? { to: `${base}/procurement/${event.requestId}`, label: "Сравнение предложений" }
      : { to: `${base}/procurement/${event.requestId}`, label: `Запрос ${number ?? ""}`.trim() };
  }
  if (event.revisionId) {
    const position = event.positionId ? `?position=${event.positionId}` : "";
    return { to: `${base}/documents/${event.revisionId}${position}`, label: "Документ" };
  }
  if (event.reportId) return { to: `${base}/field-reports`, label: "Отчёт с площадки" };
  if (event.type === "material_ordered") {
    return { to: `${base}/materials?purchase=ordered`, label: "Заказанные материалы" };
  }
  if (event.type === "delivery_received") {
    return { to: `${base}/materials?purchase=delivered`, label: "Поставленные материалы" };
  }
  if (event.type === "replacement_proposed" || event.type === "replacement_agreed") {
    return { to: `${base}/materials`, label: "Материалы" };
  }
  return null;
}

/** Лента истории объекта: события журнала и решения, новые сверху */
export function timelineOf(
  s: {
    events: ProjectEvent[];
    decisions: (ProjectDecisionRow & { link: TimelineEvent["link"] })[];
    requests: Pick<SupplyRequest, "id" | "number">[];
  },
  projectId: string,
): TimelineEvent[] {
  const events: TimelineEvent[] = s.events
    .filter((item) => item.projectId === projectId)
    .map((item) => ({
      id: item.id,
      projectId: item.projectId,
      at: item.occurredAt,
      type: item.type,
      title: item.title,
      details: item.details,
      actorId: item.actorId,
      sourceId: item.sourceId,
      link: eventLink(item, s.requests),
    }));
  const decisions: TimelineEvent[] = s.decisions
    .filter((item) => item.projectId === projectId)
    .map((item) => ({
      id: `tl-${item.id}`,
      projectId: item.projectId,
      at: item.approvedAt,
      type: "decision",
      title: item.title,
      details: item.reason,
      actorId: item.approvedBy,
      sourceId: item.basisSourceId,
      link: item.link,
    }));
  return [...events, ...decisions].sort((a, b) => b.at.localeCompare(a.at));
}
