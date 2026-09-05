import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Журнал действий — neeklo FieldOps" },
      { name: "description", content: "Кто, что и когда изменил, включая действия агентов." },
      { property: "og:title", content: "Журнал действий — neeklo FieldOps" },
      { property: "og:description", content: "Кто, что и когда изменил, включая действия агентов." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  return (
    <PagePlaceholder
      title="Журнал действий"
      description={"Кто, что и когда изменил, включая действия агентов."}
      planned={["Хронология действий пользователей и агентов","Фильтр по объекту, пользователю и типу","Было и стало для каждого изменения","Выгрузка журнала"]}
    />
  );
}
