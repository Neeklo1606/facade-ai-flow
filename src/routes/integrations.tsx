import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Интеграции — neeklo FieldOps" },
      { name: "description", content: "Каналы приёма данных и обмен с учётными системами." },
      { property: "og:title", content: "Интеграции — neeklo FieldOps" },
      { property: "og:description", content: "Каналы приёма данных и обмен с учётными системами." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <PagePlaceholder
      title="Интеграции"
      description={"Каналы приёма данных и обмен с учётными системами."}
      planned={[
        "Telegram, почта, телефония, загрузка файлов",
        "Обмен с учётной системой и ЭДО",
        "Состояние и журнал синхронизаций",
        "Ключи и вебхуки",
      ]}
    />
  );
}
