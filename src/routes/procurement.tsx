import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/procurement")({
  head: () => ({
    meta: [
      { title: "Заявки и закупки — ФАСАД-РП" },
      { name: "description", content: "Заявки поставщикам, сбор и сравнение предложений." },
      { property: "og:title", content: "Заявки и закупки — ФАСАД-РП" },
      { property: "og:description", content: "Заявки поставщикам, сбор и сравнение предложений." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Заявки и закупки" description="Заявки поставщикам, сбор и сравнение предложений." />;
}
