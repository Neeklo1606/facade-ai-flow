import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead } from "@/components/site/parts";
import { KIT } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Набор партнёра (01_SPEC 10.3). Не индексируется никогда, ссылка нигде на сайте
 * не выводится. Ссылки, QR и сценарий показа появятся в L6.
 */
export const Route = createFileRoute("/kit")({
  ssr: true,
  head: () => siteHead({ path: "/kit", ...KIT.meta }),
  component: KitPage,
});

function KitPage() {
  return (
    <SiteLayout>
      <SitePageHead title={KIT.title} lead={KIT.lead}>
        <ul className="mt-8 flex flex-col gap-2">
          {(
            [
              ["/", "Сайт"],
              ["/demo", "Демо"],
              ["/case/gas", "Кейс"],
              ["/razbor", "Экспресс-разбор"],
            ] as const
          ).map(([to, label]) => (
            <li key={to}>
              <Link
                to={to}
                className="site-body inline-flex min-h-12 items-center text-text underline-offset-4 focus-ring is-hover:underline"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </SitePageHead>
    </SiteLayout>
  );
}
