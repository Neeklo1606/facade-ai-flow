import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/materials")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search["status"] === "string" ? search["status"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Материалы — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Реестр позиций спецификации: проверка извлечённых строк, запросы, заказы и поставки.",
      },
      { property: "og:title", content: "Материалы — neeklo FieldOps" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: MaterialsPage,
});

function MaterialsPage() {
  return (
    <PagePlaceholder
      title="Материалы"
      description="Реестр позиций спецификации: проверка извлечённых строк, запросы, заказы и поставки."
      planned={[
        "Позиции спецификации со ссылкой на лист документации",
        "Фильтр «непроверенные» и массовое подтверждение",
        "Этап закупки по каждой позиции",
        "Отправка проверенных позиций в запрос поставщикам",
      ]}
    />
  );
}
