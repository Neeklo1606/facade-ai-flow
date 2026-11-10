import { createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/components/site/task/TaskPage";
import { taskByKey } from "@/lib/site/copy";
import { taskHead } from "@/lib/site/task-head";

/** Исполнительная документация (ADR-067, раздел 6.3): страница задачи сайта, отрисовка на сервере */
const task = taskByKey("docs");

export const Route = createFileRoute("/ispolnitelnaya-dokumentatsiya")({
  ssr: true,
  head: () => taskHead(task, "/og/task-docs.jpg"),
  component: () => (
    <TaskPage
      task={task}
      hero="docs-package"
      steps={["docs-materials", "docs-package", "docs-act", "docs-registry"]}
    />
  ),
});
