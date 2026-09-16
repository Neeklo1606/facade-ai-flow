import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/catalogs")({
  head: () => ({
    meta: [
      { title: "Справочники — neeklo FieldOps" },
      {
        name: "description",
        content: "Виды работ, номенклатура, единицы, нормы — с версионностью.",
      },
      { property: "og:title", content: "Справочники — neeklo FieldOps" },
      {
        property: "og:description",
        content: "Виды работ, номенклатура, единицы, нормы — с версионностью.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogsPage,
});

function CatalogsPage() {
  return (
    <PagePlaceholder
      title="Справочники"
      description={"Виды работ, номенклатура, единицы, нормы — с версионностью."}
      planned={[
        "Справочники с историей версий",
        "Кто и когда изменил значение",
        "Сопоставление с внешними системами",
        "Черновики и публикация версии",
      ]}
    />
  );
}
