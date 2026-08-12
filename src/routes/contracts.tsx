import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/contracts")({
  head: () => ({
    meta: [
      { title: "Договоры и контроль — ФАСАД-РП" },
      { name: "description", content: "Извлеченные условия договоров и контрольные точки." },
      { property: "og:title", content: "Договоры и контроль — ФАСАД-РП" },
      { property: "og:description", content: "Извлеченные условия договоров и контрольные точки." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Договоры и контроль" description="Извлеченные условия договоров и контрольные точки." />;
}
