import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Поставщики — neeklo FieldOps" },
      { name: "description", content: "Реестр поставщиков с историей поставок и надёжностью." },
      { property: "og:title", content: "Поставщики — neeklo FieldOps" },
      { property: "og:description", content: "Реестр поставщиков с историей поставок и надёжностью." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  return (
    <PagePlaceholder
      title="Поставщики"
      description={"Реестр поставщиков с историей поставок и надёжностью."}
      planned={["Карточки поставщиков и рейтинг","История цен и сроков","Замечания по качеству партий","Номенклатура, которую поставляет каждый"]}
    />
  );
}
