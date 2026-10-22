import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead, siteButton } from "@/components/site/parts";
import { CASE_STATUS } from "@/lib/site/config";
import { CASE, NAV } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Кейс газового подрядчика (01_SPEC 10.1): одностраничник для пересылки. Без названия
 * заказчика и цифр эффекта, пока владелец не включит их в конфигурации. Наполнение в L6.
 */
export const Route = createFileRoute("/case/gas")({
  ssr: true,
  head: () => siteHead({ path: "/case/gas", ...CASE.meta }),
  component: CasePage,
});

function CasePage() {
  return (
    <SiteLayout>
      <SitePageHead eyebrow={CASE_STATUS} title={CASE.title} lead={CASE.lead}>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/demo" className={siteButton.primary}>
            {NAV.demo}
            <ArrowRight className="size-5" aria-hidden />
          </Link>
          <Link to="/razbor" search={{ from: "case" }} className={siteButton.secondary}>
            {NAV.razbor}
          </Link>
        </div>
      </SitePageHead>
    </SiteLayout>
  );
}
