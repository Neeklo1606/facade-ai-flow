import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки — ФАСАД-РП" },
      { name: "description", content: "Профиль компании, эскалации, напоминания, календарь." },
      { property: "og:title", content: "Настройки — ФАСАД-РП" },
      { property: "og:description", content: "Профиль компании, эскалации, напоминания, календарь." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Настройки" description="Профиль компании, эскалации, напоминания, календарь." />;
}
