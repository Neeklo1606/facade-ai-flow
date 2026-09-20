import { z } from "zod";
import {
  projectDecision,
  timelineEvent,
  type ProjectDecision,
  type TimelineEvent,
} from "@/contracts";

/**
 * Что ждёт решения по объекту: запрос с ответами всех поставщиков, поставка, которая прибыла
 * и ждёт приёмки, или замечание по поставке для снабжения (ADR-011)
 */
export const pendingDecision = z.object({
  id: z.string().min(1),
  kind: z.enum(["request", "replacement", "delivery", "remark"]),
  title: z.string().min(1),
  details: z.string(),
  link: z.string().min(1),
});

export const timelineList = z.array(timelineEvent);
export const decisionList = z.array(projectDecision);
export const pendingList = z.array(pendingDecision);

export type PendingDecision = z.infer<typeof pendingDecision>;

/** История объекта: события и решения одной лентой. Записи пишут мутации других портов. */
export interface TimelinePort {
  /** События и решения объекта, новые сверху */
  list(projectId: string): Promise<TimelineEvent[]>;
  decisions(projectId: string): Promise<ProjectDecision[]>;
  pending(projectId: string): Promise<PendingDecision[]>;
}
