import { z } from "zod";
import {
  eventType,
  projectDecision,
  timelineEvent,
  type ProjectDecision,
  type TimelineEvent,
} from "@/contracts";
import { pageInput, type Page } from "./common";

export const listTimelineInput = pageInput.extend({
  projectId: z.string().min(1),
  types: z.array(z.enum([...eventType.values, "decision"])).optional(),
});

export const decisionList = z.array(projectDecision);
export const timelineItem = timelineEvent;

export type ListTimelineInput = z.input<typeof listTimelineInput>;

/** История объекта: события и решения одной лентой. Записи пишут мутации других портов. */
export interface TimelinePort {
  list(input: ListTimelineInput): Promise<Page<TimelineEvent>>;
  decisions(projectId: string): Promise<ProjectDecision[]>;
}
