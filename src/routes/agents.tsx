import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Агенты — neeklo FieldOps" },
      { name: "description", content: "Восемь агентов с ограниченными правами и обязательным источником." },
      { property: "og:title", content: "Агенты — neeklo FieldOps" },
      { property: "og:description", content: "Восемь агентов с ограниченными правами и обязательным источником." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <PagePlaceholder
      title="Агенты"
      description={"Восемь агентов с ограниченными правами и обязательным источником."}
      planned={["Карточки агентов: зона ответственности и права","Что агент может предложить и что запрещено","Метрики: запуски, точность, экономия времени","Тестовая площадка запуска"]}
    />
  );
}
