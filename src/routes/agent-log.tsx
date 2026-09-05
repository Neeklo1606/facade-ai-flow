import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/agent-log")({
  head: () => ({
    meta: [
      { title: "Журнал агентов — neeklo FieldOps" },
      { name: "description", content: "Каждый запуск агента: вход, выход, модель, токены, стоимость." },
      { property: "og:title", content: "Журнал агентов — neeklo FieldOps" },
      { property: "og:description", content: "Каждый запуск агента: вход, выход, модель, токены, стоимость." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentLogPage,
});

function AgentLogPage() {
  return (
    <PagePlaceholder
      title="Журнал агентов"
      description={"Каждый запуск агента: вход, выход, модель, токены, стоимость."}
      planned={["Лента запусков с фильтрами","Модель, токены, длительность и стоимость","Неудачные запуски и причина","Переход к событию, которое обрабатывалось"]}
    />
  );
}
