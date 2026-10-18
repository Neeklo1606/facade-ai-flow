import { createFileRoute } from "@tanstack/react-router";

/**
 * Вход сотрудника (ADR-021). Сам экран — в `login.lazy.tsx`: в рабочем контуре его видят
 * один раз, а в демонстрации не видят никогда, и возить его в первой загрузке незачем.
 */
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { to?: string; invite?: string } => ({
    ...(typeof search["to"] === "string" && search["to"].startsWith("/")
      ? { to: search["to"] }
      : {}),
    ...(typeof search["invite"] === "string" ? { invite: search["invite"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Вход — гайка" },
      { name: "description", content: "Вход сотрудника в рабочее пространство фасадных объектов." },
      { property: "og:title", content: "Вход — гайка" },
      {
        property: "og:description",
        content: "Вход сотрудника в рабочее пространство фасадных объектов.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
