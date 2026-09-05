import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Реестр документов — neeklo FieldOps" },
      { name: "description", content: "Десять типов документов, загрузка перетаскиванием, автоклассификация." },
      { property: "og:title", content: "Реестр документов — neeklo FieldOps" },
      { property: "og:description", content: "Десять типов документов, загрузка перетаскиванием, автоклассификация." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  return (
    <PagePlaceholder
      title="Реестр документов"
      description={"Десять типов документов, загрузка перетаскиванием, автоклассификация."}
      planned={["Загрузка перетаскиванием и распознавание типа","Фильтры по типу, объекту и статусу","Извлечённые реквизиты с уверенностью и источником","Версии и история изменений"]}
    />
  );
}
