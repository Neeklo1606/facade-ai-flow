import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead } from "@/components/site/parts";
import { CONTACT_TG, contactTgUrl, LEGAL_LINE, PRIVACY_FINAL } from "@/lib/site/config";
import { PRIVACY } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Политика обработки персональных данных для формы заявки (01_SPEC 10.4). Оператор
 * из VITE_LEGAL_LINE. Помечена черновиком, пока не задано VITE_PRIVACY_FINAL=on.
 */
export const Route = createFileRoute("/privacy")({
  ssr: true,
  head: () => siteHead({ path: "/privacy", ...PRIVACY.meta }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <SiteLayout>
      <SitePageHead
        eyebrow={PRIVACY_FINAL ? undefined : PRIVACY.draft}
        title={PRIVACY.title}
        lead="Как обрабатываются данные из формы заявки на сайте ГАЙКИ."
      />
      <div className="site-wrap flex max-w-[760px] flex-col gap-8 pb-16 lg:pb-28">
        <section aria-labelledby="privacy-operator">
          <h2 id="privacy-operator" className="site-h3 text-text">
            Оператор
          </h2>
          <p className="site-body mt-2 text-text-2">{LEGAL_LINE || PRIVACY.operator}</p>
        </section>
        {PRIVACY.sections.map((section, index) => (
          <section key={section.title} aria-labelledby={`privacy-${index}`}>
            <h2 id={`privacy-${index}`} className="site-h3 text-text">
              {section.title}
            </h2>
            <p className="site-body mt-2 text-text-2">{section.text}</p>
          </section>
        ))}
        <section aria-labelledby="privacy-contact">
          <h2 id="privacy-contact" className="site-h3 text-text">
            Контакт
          </h2>
          <p className="site-body mt-2 text-text-2">
            Вопросы, отзыв согласия и удаление данных: Telegram{" "}
            <a
              href={contactTgUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text underline underline-offset-4 focus-ring"
            >
              @{CONTACT_TG}
            </a>
            .
          </p>
        </section>
      </div>
    </SiteLayout>
  );
}
