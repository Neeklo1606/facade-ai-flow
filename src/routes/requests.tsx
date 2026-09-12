import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/requests")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search['status'] === "string" ? (search['status'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Заявки — neeklo FieldOps" },
      { name: "description", content: "Заявка на закупку: от потребности до рассылки поставщикам." },
      { property: "og:title", content: "Заявки — neeklo FieldOps" },
      { property: "og:description", content: "Заявка на закупку: от потребности до рассылки поставщикам." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RequestsPage,
});

function RequestsPage() {
  return (
    <PagePlaceholder
      title="Заявки"
      description={"Заявка на закупку: от потребности до рассылки поставщикам."}
      planned={["Мастер из четырёх шагов","Автоподбор позиций по дефициту с площадки","Выбор поставщиков и рассылка запроса","Контроль заявок без ответа"]}
    />
  );
}
