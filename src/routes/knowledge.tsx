import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "База знаний — neeklo FieldOps" },
      { name: "description", content: "Нормы, типовые узлы, регламенты и правила приёмки." },
      { property: "og:title", content: "База знаний — neeklo FieldOps" },
      { property: "og:description", content: "Нормы, типовые узлы, регламенты и правила приёмки." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  return (
    <PagePlaceholder
      title="База знаний"
      description={"Нормы, типовые узлы, регламенты и правила приёмки."}
      planned={[
        "Разделы знаний с поиском",
        "Источник каждой нормы",
        "Использование знаний агентами",
        "Добавление и проверка материалов",
      ]}
      available={[
        {
          label: "Ассистент",
          to: "/agent",
          note: "Отвечает по данным системы и всегда показывает источник",
        },
        {
          label: "Документация объекта",
          to: "/projects",
          search: { section: "documents" },
          note: "Проектная документация с распознанными позициями",
        },
      ]}
    />
  );
}
