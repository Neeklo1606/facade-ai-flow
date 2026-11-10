import { createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/components/site/task/TaskPage";
import { taskByKey } from "@/lib/site/copy";
import { taskHead } from "@/lib/site/task-head";

/** Учёт времени бригад (ADR-067, раздел 6.1): страница задачи сайта, отрисовка на сервере */
const task = taskByKey("time");

export const Route = createFileRoute("/uchet-vremeni-brigad")({
  ssr: true,
  head: () => taskHead(task, "/og/task-time.jpg"),
  component: () => (
    <TaskPage
      task={task}
      hero="time-review"
      steps={["time-brigade", "time-review", "time-week", "time-tabel"]}
    />
  ),
});
