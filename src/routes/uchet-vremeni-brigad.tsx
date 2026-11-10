import { createFileRoute } from "@tanstack/react-router";
import { TaskRoute } from "@/components/site/task/TaskRoute";
import { loadSiteHead } from "@/lib/site/head-loader";

/** Учёт времени бригад (ADR-067, раздел 6.1): страница задачи сайта, отрисовка на сервере */
export const Route = createFileRoute("/uchet-vremeni-brigad")({
  ssr: true,
  loader: () => loadSiteHead("/uchet-vremeni-brigad"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: () => (
    <TaskRoute
      task="time"
      heroPhone="time-brigade"
      hero="time-review"
      steps={["time-brigade", "time-review", "time-week", "time-tabel"]}
    />
  ),
});
