import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Задачи — ФАСАД-РП" },
      { name: "description", content: "Операционные задачи по всем объектам, вручную и от агентов." },
      { property: "og:title", content: "Задачи — ФАСАД-РП" },
      { property: "og:description", content: "Операционные задачи по всем объектам, вручную и от агентов." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Задачи" description="Операционные задачи по всем объектам, вручную и от агентов." />;
}
