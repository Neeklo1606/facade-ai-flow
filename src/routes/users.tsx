import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Пользователи и роли — neeklo FieldOps" },
      { name: "description", content: "Матрица прав семи ролей по разделам и действиям." },
      { property: "og:title", content: "Пользователи и роли — neeklo FieldOps" },
      { property: "og:description", content: "Матрица прав семи ролей по разделам и действиям." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  return (
    <PagePlaceholder
      title="Пользователи и роли"
      description={"Матрица прав семи ролей по разделам и действиям."}
      planned={[
        "Список пользователей и их объекты",
        "Матрица ролей и разрешений",
        "Ограничения прав агентов",
        "История изменения доступа",
      ]}
    />
  );
}
