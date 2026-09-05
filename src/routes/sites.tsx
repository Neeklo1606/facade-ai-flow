import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/sites")({
  head: () => ({
    meta: [
      { title: "Объекты — neeklo FieldOps" },
      { name: "description", content: "Реестр объектов: срок, объёмы, сумма договора, ответственные." },
      { property: "og:title", content: "Объекты — neeklo FieldOps" },
      { property: "og:description", content: "Реестр объектов: срок, объёмы, сумма договора, ответственные." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SitesPage,
});

function SitesPage() {
  return (
    <PagePlaceholder
      title="Объекты"
      description={"Реестр объектов: срок, объёмы, сумма договора, ответственные."}
      planned={["Таблица на десктопе и карточки на мобильном","Прогресс по объёмам и отклонение план-факт","Фильтры по заказчику, статусу и руководителю","Переход в карточку объекта"]}
    />
  );
}
