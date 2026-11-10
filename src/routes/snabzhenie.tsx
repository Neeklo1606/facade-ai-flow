import { createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/components/site/task/TaskPage";
import { taskByKey } from "@/lib/site/copy";
import { taskHead } from "@/lib/site/task-head";

/** Снабжение объекта (ADR-067, раздел 6.2): страница задачи сайта, отрисовка на сервере */
const task = taskByKey("supply");

export const Route = createFileRoute("/snabzhenie")({
  ssr: true,
  head: () => taskHead(task, "/og/task-supply.jpg"),
  component: () => (
    <TaskPage
      task={task}
      hero="supply-offers"
      steps={["supply-request", "supply-overview", "supply-offers", "supply-receive"]}
    />
  ),
});
