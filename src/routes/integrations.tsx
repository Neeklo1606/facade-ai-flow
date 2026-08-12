import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Интеграции — ФАСАД-РП" },
      { name: "description", content: "Telegram, почта, диск, языковая модель, распознавание речи." },
      { property: "og:title", content: "Интеграции — ФАСАД-РП" },
      { property: "og:description", content: "Telegram, почта, диск, языковая модель, распознавание речи." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Интеграции" description="Telegram, почта, диск, языковая модель, распознавание речи." />;
}
