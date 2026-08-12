import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Аналитика — ФАСАД-РП" },
      { name: "description", content: "Отклонения план-факт, дисциплина отчетности, сроки поставок." },
      { property: "og:title", content: "Аналитика — ФАСАД-РП" },
      { property: "og:description", content: "Отклонения план-факт, дисциплина отчетности, сроки поставок." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Аналитика" description="Отклонения план-факт, дисциплина отчетности, сроки поставок." />;
}
