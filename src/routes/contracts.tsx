import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/contracts")({
  head: () => ({
    meta: [
      { title: "Договоры и обязательства — neeklo FieldOps" },
      {
        name: "description",
        content: "Двухпанельный вид: текст договора и извлечённые обязательства.",
      },
      { property: "og:title", content: "Договоры и обязательства — neeklo FieldOps" },
      {
        property: "og:description",
        content: "Двухпанельный вид: текст договора и извлечённые обязательства.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContractsPage,
});

function ContractsPage() {
  return (
    <PagePlaceholder
      title="Договоры и обязательства"
      description={"Двухпанельный вид: текст договора и извлечённые обязательства."}
      planned={[
        "Слева страницы договора, справа обязательства",
        "Цитата и номер страницы у каждого пункта",
        "Контрольные точки и штрафные условия",
        "Связь обязательств с задачами и сроками",
      ]}
    />
  );
}
