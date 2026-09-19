import type { PositionChange, ProjectEvent } from "@/contracts";
import { tick } from "./clock";

/** Записи журналов, которые пишут действия и симулятор демо */

let seq = 0;
/** Ключи новых записей в режиме базы — `uuid` (ADR-005, п. 10); подставляет мост адаптера БД */
let idFactory: ((prefix: string) => string) | null = null;

export function liveId(prefix: string) {
  if (idFactory) return idFactory(prefix);
  seq += 1;
  return `${prefix}-live-${Date.now()}-${seq}`;
}

/** Подменить фабрику ключей; возвращает прежнюю, чтобы вернуть её после действия */
export function setIdFactory(next: ((prefix: string) => string) | null) {
  const prev = idFactory;
  idFactory = next;
  return prev;
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
