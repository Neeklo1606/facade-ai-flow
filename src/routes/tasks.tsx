import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/tasks")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search["status"] === "string" ? (search["status"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Задачи и замечания — neeklo FieldOps" },
      { name: "description", content: "Происхождение задачи важно так же, как сама задача." },
      { property: "og:title", content: "Задачи и замечания — neeklo FieldOps" },
      {
        property: "og:description",
        content: "Происхождение задачи важно так же, как сама задача.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  return (
    <PagePlaceholder
      title="Задачи и замечания"
      description={"Происхождение задачи важно так же, как сама задача."}
      planned={[
        "Таблица и канбан по статусам",
        "Происхождение: отчёт, договор, агент, вручную",
        "Просрочки, ответственные, сроки",
        "Переход к первоисточнику задачи",
      ]}
    />
  );
}
