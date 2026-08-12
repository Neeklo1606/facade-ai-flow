import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/agent-log")({
  head: () => ({
    meta: [
      { title: "Журнал агентов — ФАСАД-РП" },
      { name: "description", content: "Все запуски агентов: вход, шаги, результат, стоимость." },
      { property: "og:title", content: "Журнал агентов — ФАСАД-РП" },
      { property: "og:description", content: "Все запуски агентов: вход, шаги, результат, стоимость." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Журнал агентов" description="Все запуски агентов: вход, шаги, результат, стоимость." />;
}
