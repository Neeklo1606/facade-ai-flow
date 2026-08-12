import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Поставщики — ФАСАД-РП" },
      { name: "description", content: "Реестр поставщиков, сроки ответа и надежность." },
      { property: "og:title", content: "Поставщики — ФАСАД-РП" },
      { property: "og:description", content: "Реестр поставщиков, сроки ответа и надежность." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Поставщики" description="Реестр поставщиков, сроки ответа и надежность." />;
}
