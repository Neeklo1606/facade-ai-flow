import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/risks")({
  validateSearch: (search: Record<string, unknown>) => ({
    severity: typeof search['severity'] === "string" ? (search['severity'] as string) : undefined,
    kind: typeof search['kind'] === "string" ? (search['kind'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Риски и отклонения — neeklo FieldOps" },
      { name: "description", content: "Строгий формат: риск, причина, действие, ответственный, срок. Ничего размытого." },
      { property: "og:title", content: "Риски и отклонения — neeklo FieldOps" },
      { property: "og:description", content: "Строгий формат: риск, причина, действие, ответственный, срок. Ничего размытого." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RisksPage,
});

function RisksPage() {
  return (
    <PagePlaceholder
      title="Риски и отклонения"
      description={"Строгий формат: риск, причина, действие, ответственный, срок. Ничего размытого."}
      planned={["Таблица рисков с сортировкой по критичности","Кнопка «Показать источник» у каждой строки","Фильтр по объекту, типу и ответственному","Перевод риска в задачу одним действием"]}
    />
  );
}
