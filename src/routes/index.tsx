import { createFileRoute, Navigate } from "@tanstack/react-router";
import { demoShow } from "@/api/config";
import { useCurrentRole } from "@/lib/project-scope";
import { homeRouteFor } from "@/lib/navigation";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Landing } from "@/components/site/landing/Landing";
import { LANDING } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Корень адреса (ADR-047). В демо-сборке это лендинг ГАЙКИ: сайт, а не приложение,
 * отрисованный на сервере. Вход в демо переехал на `/demo`.
 *
 * В рабочем контуре сайта нет: корень по-прежнему дверь на рабочий экран роли (ADR-028).
 * Прежний дашборд живёт на `/attention`.
 */
export const Route = createFileRoute("/")({
  ssr: demoShow,
  head: () => siteHead({ path: "/", ...LANDING.meta, image: "/og/landing.jpg" }),
  component: Home,
});

function Home() {
  if (!demoShow) return <WorkHome />;
  return (
    <SiteLayout>
      <Landing />
    </SiteLayout>
  );
}

function WorkHome() {
  const role = useCurrentRole();
  return <Navigate to={homeRouteFor(role)} replace />;
}
