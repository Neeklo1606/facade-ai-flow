import { createFileRoute, Navigate } from "@tanstack/react-router";
import { demoShow } from "@/api/config";
import { useCurrentRole } from "@/lib/project-scope";
import { homeRouteFor } from "@/lib/navigation";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Home } from "@/components/site/home/Home";
import { loadSiteHead } from "@/lib/site/head-loader";

/**
 * Корень адреса (ADR-047, ADR-067). В демо-сборке это главная сайта ГАЙКИ, отрисованная
 * на сервере. Вход в демо на `/demo`.
 *
 * В рабочем контуре сайта нет: корень по-прежнему дверь на рабочий экран роли (ADR-028).
 */
export const Route = createFileRoute("/")({
  ssr: demoShow,
  // В рабочем контуре сайта нет: и меты сайта нет
  loader: () => (demoShow ? loadSiteHead("/") : null),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: HomeRoute,
});

function HomeRoute() {
  if (!demoShow) return <WorkHome />;
  return (
    <SiteLayout>
      <Home />
    </SiteLayout>
  );
}

function WorkHome() {
  const role = useCurrentRole();
  return <Navigate to={homeRouteFor(role)} replace />;
}
