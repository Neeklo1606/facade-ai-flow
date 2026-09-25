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
  head: () => ({ meta: [{ title: "Вход — neeklo FieldOps" }] }),
});
