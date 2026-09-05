import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Аналитика — neeklo FieldOps" },
      { name: "description", content: "Темпы, себестоимость, надёжность поставщиков, нагрузка бригад." },
      { property: "og:title", content: "Аналитика — neeklo FieldOps" },
      { property: "og:description", content: "Темпы, себестоимость, надёжность поставщиков, нагрузка бригад." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <PagePlaceholder
      title="Аналитика"
      description={"Темпы, себестоимость, надёжность поставщиков, нагрузка бригад."}
      planned={["Темп работ и прогноз завершения","Отклонения по объектам","Надёжность поставщиков","Выгрузка отчётов"]}
    />
  );
}
