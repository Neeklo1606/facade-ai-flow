import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/quality")({
  head: () => ({
    meta: [
      { title: "Качество извлечения — neeklo FieldOps" },
      { name: "description", content: "Насколько модели можно доверять и где она ошибается." },
      { property: "og:title", content: "Качество извлечения — neeklo FieldOps" },
      {
        property: "og:description",
        content: "Насколько модели можно доверять и где она ошибается.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QualityPage,
});

function QualityPage() {
  return (
    <PagePlaceholder
      title="Качество извлечения"
      description={"Насколько модели можно доверять и где она ошибается."}
      planned={[
        "Точность по типам полей и каналам",
        "Доля правок человеком",
        "Динамика уверенности по неделям",
        "Проблемные шаблоны документов",
      ]}
      available={[
        {
          label: "Отчёты с площадки",
          to: "/projects",
          search: { section: "field-reports" },
          note: "Объём за смену, фото и проблемы с приёмкой или возвратом",
        },
        {
          label: "Проверка документации",
          to: "/projects",
          search: { section: "documents" },
          note: "Извлечённые позиции с уверенностью распознавания",
        },
      ]}
    />
  );
}
