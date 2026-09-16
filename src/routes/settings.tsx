import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки — neeklo FieldOps" },
      {
        name: "description",
        content: "Параметры рабочего пространства, уведомлений и отраслевого пакета.",
      },
      { property: "og:title", content: "Настройки — neeklo FieldOps" },
      {
        property: "og:description",
        content: "Параметры рабочего пространства, уведомлений и отраслевого пакета.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <PagePlaceholder
      title="Настройки"
      description={"Параметры рабочего пространства, уведомлений и отраслевого пакета."}
      planned={[
        "Отраслевой пакет и терминология",
        "Правила уведомлений и эскалаций",
        "Пороги уверенности для автопроведения",
        "Оформление и тема интерфейса",
      ]}
    />
  );
}
