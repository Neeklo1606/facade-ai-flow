import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/objects")({
  head: () => ({
    meta: [
      { title: "Объекты — ФАСАД-РП" },
      { name: "description", content: "Все объекты компании: сроки, готовность, бюджет." },
      { property: "og:title", content: "Объекты — ФАСАД-РП" },
      { property: "og:description", content: "Все объекты компании: сроки, готовность, бюджет." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Объекты" description="Все объекты компании: сроки, готовность, бюджет." />;
}
