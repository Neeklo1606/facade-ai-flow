import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * «Отчёт» заменён «Табелем» (ADR-061, 11): старые ссылки и закладки ведут туда же,
 * переход из сценария `?highlight=` сохраняется
 */
export const Route = createFileRoute("/gas/reports")({
  validateSearch: (search: Record<string, unknown>): { highlight?: string | undefined } => ({
    highlight:
      typeof search["highlight"] === "string" && search["highlight"]
        ? search["highlight"]
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/gas/tabel", search: { highlight: search.highlight }, replace: true });
  },
});
