import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Пользователи и роли — ФАСАД-РП" },
      { name: "description", content: "Сотрудники, доступы и матрица прав." },
      { property: "og:title", content: "Пользователи и роли — ФАСАД-РП" },
      { property: "og:description", content: "Сотрудники, доступы и матрица прав." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Пользователи и роли" description="Сотрудники, доступы и матрица прав." />;
}
