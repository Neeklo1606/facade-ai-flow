import { createFileRoute } from "@tanstack/react-router";
import { TaskRoute } from "@/components/site/task/TaskRoute";
import { loadSiteHead } from "@/lib/site/head-loader";

/** Исполнительная документация (ADR-067, раздел 6.3): страница задачи сайта, отрисовка на сервере */
export const Route = createFileRoute("/ispolnitelnaya-dokumentatsiya")({
  ssr: true,
  loader: () => loadSiteHead("/ispolnitelnaya-dokumentatsiya"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: () => (
    <TaskRoute
      task="docs"
      hero="docs-package"
      steps={["docs-materials", "docs-package", "docs-act", "docs-registry"]}
    />
  ),
});
