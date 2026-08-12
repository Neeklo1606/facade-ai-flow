import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Документы — ФАСАД-РП" },
      { name: "description", content: "Реестр документации с обработкой агентом." },
      { property: "og:title", content: "Документы — ФАСАД-РП" },
      { property: "og:description", content: "Реестр документации с обработкой агентом." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Документы" description="Реестр документации с обработкой агентом." />;
}
