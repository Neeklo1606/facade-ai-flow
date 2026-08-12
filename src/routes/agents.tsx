import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Агенты — ФАСАД-РП" },
      { name: "description", content: "AI-агенты системы, настройки и точность." },
      { property: "og:title", content: "Агенты — ФАСАД-РП" },
      { property: "og:description", content: "AI-агенты системы, настройки и точность." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Агенты" description="AI-агенты системы, настройки и точность." />;
}
