import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/catalogs")({
  head: () => ({
    meta: [
      { title: "Справочники — ФАСАД-РП" },
      { name: "description", content: "Номенклатура, виды работ, статусы, шаблоны." },
      { property: "og:title", content: "Справочники — ФАСАД-РП" },
      { property: "og:description", content: "Номенклатура, виды работ, статусы, шаблоны." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Справочники" description="Номенклатура, виды работ, статусы, шаблоны." />;
}
