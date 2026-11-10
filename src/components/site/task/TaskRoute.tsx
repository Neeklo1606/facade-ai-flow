import { taskByKey } from "@/lib/site/copy";
import type { LeadTask } from "@/lib/site/lead-fields";
import type { ShotId } from "../visuals";
import { TaskPage } from "./TaskPage";

/** Страница задачи по ключу: тексты грузятся вместе с компонентом, а не с маршрутом */
export function TaskRoute({
  task,
  hero,
  heroPhone,
  steps,
}: {
  task: LeadTask;
  hero: ShotId;
  heroPhone?: ShotId;
  steps: readonly [ShotId, ShotId, ShotId, ShotId];
}) {
  return (
    <TaskPage
      task={taskByKey(task)}
      hero={hero}
      {...(heroPhone ? { heroPhone } : {})}
      steps={steps}
    />
  );
}
