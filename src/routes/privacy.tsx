import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead } from "@/components/site/parts";
import { CONTACT_TG, PRIVACY_FINAL } from "@/lib/site/config";
import { PRIVACY } from "@/lib/site/copy";
import { siteHead } from "@/lib/site/head";

/**
 * Политика обработки персональных данных для формы заявки (01_SPEC 10.4).
 * Помечена черновиком, пока не задано VITE_PRIVACY_FINAL=on. Полный текст в L6.
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
        lead="Форма заявки собирает имя, компанию, телефон и число бригад, чтобы связаться по заявке. Данные не передаются третьим лицам без вашего согласия."
      >
        <p className="site-body mt-6 text-text-2">
          Вопросы по обработке данных: Telegram @{CONTACT_TG}.
        </p>
      </SitePageHead>
    </SiteLayout>
  );
}
