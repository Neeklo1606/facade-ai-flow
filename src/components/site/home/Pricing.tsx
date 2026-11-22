import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { PRICES } from "@/lib/site/config";
import { HOME } from "@/lib/site/copy";
import { track } from "@/lib/site/analytics";
import { cn } from "@/lib/utils";
import { siteButton } from "../parts";

/**
 * Тарифы (ADR-083): подписка «Старт» от цены владельца, «Под ключ» с ценой пилота,
 * «Компания» после разбора. Цены из config: пустая переменная окружения убирает цифру.
 * Снабжение и ПТО помечены «в демо» рядом с пунктом (правило 3).
 */
export function Pricing() {
  const { pricing } = HOME;
  const price = {
    start: PRICES.subscription ? { value: `от ${PRICES.subscription}`, per: pricing.month } : null,
    turnkey: PRICES.pilot ? { value: `от ${PRICES.pilot}`, per: pricing.once } : null,
    company: null,
  } as const;
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="site-block site-pricing">
      <div className="site-wrap">
        <h2 id="pricing-title" className="site-h2">
          {pricing.title}
        </h2>
        <p className="site-body site-pricing-lead">{pricing.lead}</p>
        <ul className="site-plans">
          {pricing.plans.map((plan) => {
            const cost = price[plan.key as keyof typeof price];
            const featured = plan.key === "turnkey";
            const cta = cn(
              featured ? siteButton.primary : siteButton.secondary,
              "site-plan-cta w-full justify-center",
            );
            return (
              <li
                key={plan.key}
                className="site-plan"
                data-plan={plan.key}
                data-featured={featured ? "" : undefined}
              >
                <h3 className="site-plan-name">{plan.name}</h3>
                <p className="site-plan-note">{plan.note}</p>
                <p className="site-plan-price" data-price>
                  {cost ? (
                    <>
                      <span className="tnum">{cost.value}</span>{" "}
                      <span className="site-plan-per">{cost.per}</span>
                    </>
                  ) : (
                    <span className="site-plan-ask">{pricing.afterTalk}</span>
                  )}
                </p>
                <ul className="site-plan-items">
                  {plan.items.map((item) => (
                    <li key={item.text}>
                      <Check className="size-4 shrink-0" aria-hidden />
                      <span>
                        {item.text}
                        {"demo" in item && item.demo ? (
                          <span className="site-inside-tag">{pricing.demoTag}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {plan.to.startsWith("#") ? (
                  <a
                    href={plan.to}
                    className={cta}
                    onClick={() => track("plan_click", { plan: plan.key })}
                  >
                    {plan.cta}
                    <ArrowRight className="size-5" aria-hidden />
                  </a>
                ) : (
                  <Link
                    to="/demo"
                    className={cta}
                    onClick={() => track("plan_click", { plan: plan.key })}
                  >
                    {plan.cta}
                    <ArrowRight className="size-5" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
