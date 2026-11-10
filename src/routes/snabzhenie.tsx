import { createFileRoute } from "@tanstack/react-router";
import { TaskRoute } from "@/components/site/task/TaskRoute";
import { loadSiteHead } from "@/lib/site/head-loader";

/** Снабжение объекта (ADR-067, раздел 6.2): страница задачи сайта, отрисовка на сервере */
export const Route = createFileRoute("/snabzhenie")({
  ssr: true,
  loader: () => loadSiteHead("/snabzhenie"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: () => (
    <TaskRoute
      task="supply"
      heroPhone="supply-request"
      hero="supply-offers"
      steps={["supply-request", "supply-overview", "supply-offers", "supply-receive"]}
    />
  ),
});
