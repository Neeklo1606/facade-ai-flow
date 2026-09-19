import type { PositionChange, ProjectEvent } from "@/contracts";
import { tick } from "./clock";

/** Записи журналов, которые пишут действия и симулятор демо */

let seq = 0;
export function liveId(prefix: string) {
  seq += 1;
  return `${prefix}-live-${Date.now()}-${seq}`;
}

type EventInput = Pick<ProjectEvent, "projectId" | "type" | "title" | "details"> &
  Partial<ProjectEvent>;

/** Событие истории объекта; по умолчанию — от действующего сотрудника */
export function projectEvent(input: EventInput, actorId: string | null): ProjectEvent {
  return {
    id: liveId("ev"),
    occurredAt: tick(),
    actorKind: actorId ? "user" : "system",
    actorId,
    sourceId: null,
    requestId: null,
    revisionId: null,
    deliveryId: null,
    positionId: null,
    reportId: null,
    ...input,
  };
}

export function positionChange(
  positionId: string,
  actorId: string,
  action: string,
  before: string | null = null,
  after: string | null = null,
): PositionChange {
  return {
    id: liveId("pc"),
    positionId,
    at: tick(),
    actorKind: "user",
    actorId,
    action,
    before,
    after,
  };
}
