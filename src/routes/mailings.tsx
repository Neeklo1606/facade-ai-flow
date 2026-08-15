import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/mailings")({
  head: () => ({
    meta: [
      { title: "Рассылки заказчикам — ФАСАД-РП" },
      {
        name: "description",
        content: "Письма заказчикам: агент готовит черновик, отправка — только после подтверждения человеком.",
      },
      { property: "og:title", content: "Рассылки заказчикам — ФАСАД-РП" },
      {
        property: "og:description",
        content: "Черновики писем от агентов и подтверждение отправки человеком.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PagePlaceholder
      title="Рассылки заказчикам"
      description="Агент готовит письмо по данным объекта, отправка — только после подтверждения человеком."
      note="Раздел появится на следующем шаге прототипа. Любая отправка здесь будет демо-имитацией."
    />
  );
}
