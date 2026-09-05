import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/quotes")({
  head: () => ({
    meta: [
      { title: "Предложения поставщиков — neeklo FieldOps" },
      { name: "description", content: "Сравнение ответов с указанием происхождения каждой цены." },
      { property: "og:title", content: "Предложения поставщиков — neeklo FieldOps" },
      { property: "og:description", content: "Сравнение ответов с указанием происхождения каждой цены." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuotesPage,
});

function QuotesPage() {
  return (
    <PagePlaceholder
      title="Предложения поставщиков"
      description={"Сравнение ответов с указанием происхождения каждой цены."}
      planned={["Сравнительная таблица по позициям","Подсветка лучшей цены и лучшего срока","Ссылка на письмо или счёт, откуда взята цена","Подтверждение выбора человеком"]}
    />
  );
}
