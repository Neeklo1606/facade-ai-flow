import { loadSiteHead } from "@/lib/site/head-loader";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead, SiteSkeleton } from "@/components/site/parts";
import { useForcedState } from "@/lib/screen-state";
import { KIT } from "@/lib/site/copy";

/**
 * Набор партнёра (01_SPEC 10.3). Не индексируется никогда, ссылка нигде на сайте не выводится.
 * Ссылки с кодом партнёра, QR и сценарий показа; QR и копирование работают на клиенте.
 */
const PartnerKit = lazy(() => import("@/components/site/kit/PartnerKit"));

export const Route = createFileRoute("/kit")({
  ssr: true,
  loader: () => loadSiteHead("/kit"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: KitPage,
});

function KitSkeleton() {
  return (
    <div className="site-wrap pb-16">
      <SiteSkeleton blocks={4} label="Загружаю ссылки и QR-коды" />
    </div>
  );
}

function KitPage() {
  const forced = useForcedState();
  return (
    <SiteLayout>
      <SitePageHead title={KIT.title} lead={KIT.lead} />
      {forced === "loading" ? (
        <KitSkeleton />
      ) : (
        <Suspense fallback={<KitSkeleton />}>
          <PartnerKit />
        </Suspense>
      )}
    </SiteLayout>
  );
}
