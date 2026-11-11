import { loadSiteHead } from "@/lib/site/head-loader";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SitePageHead } from "@/components/site/parts";
import { LeadSection } from "@/components/site/blocks";
import { ArticleGrid, HeroBackdrop } from "@/components/site/growth";
import { ARTICLES, ARTICLES_PAGE, type Article } from "@/lib/site/pages";

/**
 * Раздел статей (ADR-068): список с фильтром по теме. Фильтр только сужает видимое,
 * все ссылки на статьи есть в HTML сервера для поиска.
 */
export const Route = createFileRoute("/stati/")({
  ssr: true,
  loader: () => loadSiteHead("/stati"),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: ArticlesPage,
});

const TOPICS = Array.from(new Set(ARTICLES.map((item) => item.topic)));

function ArticlesPage() {
  const [topic, setTopic] = useState<Article["topic"] | null>(null);
  const items = topic ? ARTICLES.filter((item) => item.topic === topic) : ARTICLES;
  return (
    <SiteLayout>
      <section data-hero className="site-page-hero bg-void">
        <HeroBackdrop />
        <SitePageHead
          eyebrow={<span className="site-chip-grad">{ARTICLES_PAGE.eyebrow}</span>}
          title={ARTICLES_PAGE.title}
          lead={ARTICLES_PAGE.lead}
        >
          <div className="site-chips-scroll mt-8" role="group" aria-label="Темы">
            {[null, ...TOPICS].map((item) => (
              <button
                key={item ?? "all"}
                type="button"
                aria-pressed={topic === item}
                onClick={() => setTopic(item)}
                className="site-filter-chip focus-ring"
              >
                {item ?? ARTICLES_PAGE.all}
              </button>
            ))}
          </div>
        </SitePageHead>
      </section>
      <div className="site-wrap pb-16 lg:pb-28">
        <ArticleGrid items={items} />
      </div>
      <LeadSection source="article" />
    </SiteLayout>
  );
}
