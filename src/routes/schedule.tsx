import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "График работ — ФАСАД-РП" },
      { name: "description", content: "Календарно-сетевой график: этапы, захватки, план и факт." },
      { property: "og:title", content: "График работ — ФАСАД-РП" },
      { property: "og:description", content: "Календарно-сетевой график: этапы, захватки, план и факт." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="График работ" description="Календарно-сетевой график: этапы, захватки, план и факт." />;
}
