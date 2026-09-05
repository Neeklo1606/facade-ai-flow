import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "График работ — neeklo FieldOps" },
      { name: "description", content: "Гант по видам работ с критическим путём и прогнозом срыва." },
      { property: "og:title", content: "График работ — neeklo FieldOps" },
      { property: "og:description", content: "Гант по видам работ с критическим путём и прогнозом срыва." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  return (
    <PagePlaceholder
      title="График работ"
      description={"Гант по видам работ с критическим путём и прогнозом срыва."}
      planned={["Гант по захваткам и видам работ","Подсветка критического пути","Прогноз срыва срока по текущему темпу","Связь задержек с рисками"]}
    />
  );
}
