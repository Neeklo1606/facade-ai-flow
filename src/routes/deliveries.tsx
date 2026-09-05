import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/deliveries")({
  head: () => ({
    meta: [
      { title: "Поставки — neeklo FieldOps" },
      { name: "description", content: "Ожидаемые и принятые партии, входной контроль." },
      { property: "og:title", content: "Поставки — neeklo FieldOps" },
      { property: "og:description", content: "Ожидаемые и принятые партии, входной контроль." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeliveriesPage,
});

function DeliveriesPage() {
  return (
    <PagePlaceholder
      title="Поставки"
      description={"Ожидаемые и принятые партии, входной контроль."}
      planned={["Календарь ожидаемых поставок","Входной контроль с фото и чек-листом","Расхождения по количеству и качеству","Связь поставки с заявкой и объектом"]}
    />
  );
}
