import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/zones")({
  head: () => ({
    meta: [
      { title: "Захватки и объёмы — neeklo FieldOps" },
      {
        name: "description",
        content: "Иерархия объект → корпус → секция → этаж → захватка и объёмы по видам работ.",
      },
      { property: "og:title", content: "Захватки и объёмы — neeklo FieldOps" },
      {
        property: "og:description",
        content: "Иерархия объект → корпус → секция → этаж → захватка и объёмы по видам работ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ZonesPage,
});

function ZonesPage() {
  return (
    <PagePlaceholder
      title="Захватки и объёмы"
      description={"Иерархия объект → корпус → секция → этаж → захватка и объёмы по видам работ."}
      planned={[
        "Дерево иерархии с раскрытием уровней",
        "План, факт и остаток по каждому виду работ",
        "Источник каждой цифры факта",
        "Ручная корректировка с обязательным обоснованием",
      ]}
    />
  );
}
