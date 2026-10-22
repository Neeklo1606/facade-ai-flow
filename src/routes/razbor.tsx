import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead, siteButton } from "@/components/site/parts";
import { contactTgUrl, PRICES, RAZBOR_CREDIT } from "@/lib/site/config";
import { leadMessage, RAZBOR } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/** Откуда пришли на разбор: уходит в текст заявки (01_SPEC 11.1) */
const SOURCES = ["landing", "demo-final", "case", "razbor"] as const;
type Source = (typeof SOURCES)[number];

/**
 * Экспресс-разбор (01_SPEC 10.2): первая маленькая оплата и заявка на неё. Форма и порт
 * заявок появятся в L6. До тех пор честный путь: готовое сообщение в Telegram владельца,
 * без ложного «Заявка отправлена».
 */
export const Route = createFileRoute("/razbor")({
  ssr: true,
  validateSearch: (search: Record<string, unknown>): { from?: Source } => {
    const from = String(search["from"] ?? "");
    return (SOURCES as readonly string[]).includes(from) ? { from: from as Source } : {};
  },
  head: () => siteHead({ path: "/razbor", ...RAZBOR.meta }),
  component: RazborPage,
});

function RazborPage() {
  const { from = "razbor" } = Route.useSearch();
  return (
    <SiteLayout>
      <SitePageHead title={RAZBOR.title} lead={RAZBOR.lead}>
        <p className="site-body mt-6 text-text">{PRICES.razbor || RAZBOR.price}</p>
        {RAZBOR_CREDIT ? <p className="site-caption mt-1 text-text-3">{RAZBOR.credit}</p> : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={contactTgUrl(leadMessage(from))}
            target="_blank"
            rel="noopener noreferrer"
            className={siteButton.primary}
          >
            <Send className="size-4" aria-hidden />
            Написать в Telegram
          </a>
        </div>
        <p className="site-caption mt-4 max-w-[640px] text-text-3">{RAZBOR.transfer}</p>
      </SitePageHead>

      <div className="site-wrap grid gap-10 pb-16 sm:grid-cols-2 lg:pb-28">
        {[RAZBOR.send, RAZBOR.get].map((block) => (
          <section key={block.title} aria-label={block.title}>
            <h2 className="site-h3 text-text">{block.title}</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {block.items.map((item) => (
                <li key={item} className="site-body flex gap-3 text-text-2">
                  <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-orange" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </SiteLayout>
  );
}
