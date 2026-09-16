import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Шаблоны — neeklo FieldOps" },
      { name: "description", content: "Шаблоны писем, актов, запросов и чек-листов." },
      { property: "og:title", content: "Шаблоны — neeklo FieldOps" },
      { property: "og:description", content: "Шаблоны писем, актов, запросов и чек-листов." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <PagePlaceholder
      title="Шаблоны"
      description={"Шаблоны писем, актов, запросов и чек-листов."}
      planned={[
        "Библиотека шаблонов по типам",
        "Подстановка данных объекта и договора",
        "Предпросмотр перед отправкой",
        "Версионность шаблонов",
      ]}
    />
  );
}
