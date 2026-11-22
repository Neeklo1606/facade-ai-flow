import { useEffect } from "react";
import { LANDING } from "@/lib/site/copy";
import { track } from "@/lib/site/analytics";
import { AUDIENCE } from "@/lib/site/pages";
import { SiteSection } from "../parts";
import { FaqList, LeadSection, StickyCta } from "../blocks";
import { HeroLive } from "../landing/hero-live";
import { HeroForm } from "../landing/hero-form";
import { RoleCards } from "../growth";
import { Inside } from "./Inside";
import { Pricing } from "./Pricing";

/**
 * Главная v3 (ADR-083, постановка владельца 23.11.2026): пять экранов, минимум текста.
 * 1. Первый экран (прежний, нравится владельцу).
 * 2. «Как работает внутри»: айфон с записью демо и пять сценариев.
 * 3. Роли: кому что снимает.
 * 4. Тарифы и вопросы.
 * 5. Заявка.
 * Порядок как у конкурентов (ПТО Онлайн, Gectaro): обещание, продукт в работе, для кого,
 * цена, заявка. Убранные блоки v2 (задачи, путь, сравнение, офис, контроль, кейс, старт,
 * статьи) живут на страницах задач, /kak-rabotaet и /case/gas.
 */
export function Home() {
  useEffect(() => track("landing_view"), []);
  return (
    <div className="site-home">
      <Hero />
      <Inside />
      <SiteSection id="roles" title={AUDIENCE.homeTitle} lead={AUDIENCE.homeLead} tone="card">
        <RoleCards />
      </SiteSection>
      <Pricing />
      <SiteSection id="faq" title={LANDING.faq.title}>
        <FaqList items={LANDING.faq.items} place="landing" />
      </SiteSection>
      <LeadSection source="landing" />
      <StickyCta />
    </div>
  );
}

function Hero() {
  const { hero } = LANDING;
  return (
    <section data-hero aria-labelledby="hero-title" className="site-hero site-hero-warm">
      <CharField />
      <div className="site-wrap site-hero-inner">
        <div className="site-hero-copy">
          <p className="site-hero-eyebrow">{hero.eyebrow}</p>
          <h1 id="hero-title" className="site-h1 site-hero-title">
            {hero.title}
          </h1>
          <p className="site-lead site-hero-lead site-only-desk">{hero.lead}</p>
          <p className="site-lead site-hero-lead site-only-phone">{hero.leadShort}</p>
        </div>
        <HeroForm />
        <div className="site-hero-visual">
          <HeroLive />
        </div>
      </div>
    </section>
  );
}

/**
 * Сетка символов первого экрана (CharField): декор текстом в псевдоэлементе CSS, без скриптов
 * и картинок. Строки сдвигаются на символ, к краю сетка проявляется маской
 */
const CHAR_SET = ["=", "+", "0", "a", "k", "b", "d", "h", "W", "#", "M", "&", "$"];
const CHAR_FIELD = Array.from({ length: 28 }, (_, row) =>
  Array.from({ length: 34 }, (_, col) => {
    const at = Math.floor((col + row) / 2);
    return CHAR_SET[Math.min(at, CHAR_SET.length - 1)];
  }).join(" "),
).join("\n");

function CharField() {
  return <div aria-hidden className="site-chars" data-chars={CHAR_FIELD} />;
}
