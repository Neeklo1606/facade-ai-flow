import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "База знаний — ФАСАД-РП" },
      { name: "description", content: "Материалы, на которых агенты строят ответы." },
      { property: "og:title", content: "База знаний — ФАСАД-РП" },
      { property: "og:description", content: "Материалы, на которых агенты строят ответы." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="База знаний" description="Материалы, на которых агенты строят ответы." />;
}
