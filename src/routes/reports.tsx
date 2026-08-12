import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Отчеты с объектов — ФАСАД-РП" },
      { name: "description", content: "Ежедневные отчеты прорабов, пришедшие из Telegram." },
      { property: "og:title", content: "Отчеты с объектов — ФАСАД-РП" },
      { property: "og:description", content: "Ежедневные отчеты прорабов, пришедшие из Telegram." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Отчеты с объектов" description="Ежедневные отчеты прорабов, пришедшие из Telegram." />;
}
