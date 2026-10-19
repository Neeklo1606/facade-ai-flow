import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Справочники переехали в кабинет компании (ADR-039): старый адрес ведёт туда же */
export const Route = createFileRoute("/catalogs")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { new?: "material" | "import" | undefined } => ({
    new:
      search["new"] === "material" || search["new"] === "import"
        ? (search["new"] as "material" | "import")
        : undefined,
  }),
  head: () =>
    completePageHead({ meta: [] }, "Справочники — гайка", "Материалы и корпоративные справочники."),
  component: CatalogsRedirect,
});

function CatalogsRedirect() {
  const search = Route.useSearch();
  return <Navigate to="/office/catalogs" search={search} replace />;
}
