import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/field-reports")({
  head: () => ({
    meta: [
      { title: "Отчёты с площадки — neeklo FieldOps" },
      { name: "description", content: "Подтверждённые отчёты бригад: объёмы, фото, замечания." },
      { property: "og:title", content: "Отчёты с площадки — neeklo FieldOps" },
      { property: "og:description", content: "Подтверждённые отчёты бригад: объёмы, фото, замечания." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FieldReportsPage,
});

function FieldReportsPage() {
  return (
    <PagePlaceholder
      title="Отчёты с площадки"
      description={"Подтверждённые отчёты бригад: объёмы, фото, замечания."}
      planned={["Лента отчётов по сменам и захваткам","Голос, текст, фото и чек-листы в одном виде","Объёмы, попавшие в план-факт, со ссылкой на источник","Возврат отчёта автору с комментарием"]}
    />
  );
}
