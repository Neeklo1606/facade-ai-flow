import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Журнал действий — ФАСАД-РП" },
      { name: "description", content: "Аудит-лог всех действий в системе." },
      { property: "og:title", content: "Журнал действий — ФАСАД-РП" },
      { property: "og:description", content: "Аудит-лог всех действий в системе." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Журнал действий" description="Аудит-лог всех действий в системе." />;
}
