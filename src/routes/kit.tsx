import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead } from "@/components/site/parts";
import { KIT } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Набор партнёра (01_SPEC 10.3). Не индексируется никогда, ссылка нигде на сайте не выводится.
 * Ссылки с кодом партнёра, QR и сценарий показа; QR и копирование работают на клиенте.
 */
const PartnerKit = lazy(() => import("@/components/site/kit/PartnerKit"));

export const Route = createFileRoute("/kit")({
  ssr: true,
  head: () => siteHead({ path: "/kit", ...KIT.meta }),
  component: KitPage,
});

function KitPage() {
  return (
    <SiteLayout>
      <SitePageHead title={KIT.title} lead={KIT.lead} />
      <Suspense fallback={<div className="site-wrap min-h-dvh" />}>
        <PartnerKit />
      </Suspense>
    </SiteLayout>
  );
}
