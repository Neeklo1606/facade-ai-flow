import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SiteNotFound } from "@/components/site/NotFound";
import { Breadcrumbs, siteButton } from "@/components/site/parts";
import { LeadSection, StickyCta } from "@/components/site/blocks";
import { ArticleGrid, HeroBackdrop, ReadingProgress } from "@/components/site/growth";
import { ARTICLES, ARTICLES_PAGE, articleBySlug, readingMinutes } from "@/lib/site/pages";
import { TASKS } from "@/lib/site/copy";
import { cn } from "@/lib/utils";

/**
 * Статья (ADR-068): крошки, тема и время чтения, H1, вводная, текст колонкой 720,
 * блок «как это устроено в ГАЙКЕ» со ссылкой на задачу, три другие статьи, заявка.
 * Мета и JSON-LD Article приходят загрузчиком, как у остальных страниц сайта.
 */
export const Route = createFileRoute("/stati/$slug")({
  ssr: true,
  // Тексты статей и мета грузятся отдельным куском: загрузчик живёт в первом куске приложения
  loader: async ({ params }) => {
    const { articleHeadFor } = await import("@/lib/site/route-heads");
    const head = articleHeadFor(params.slug);
    if (!head) throw notFound();
    return { head };
  },
  head: ({ loaderData }) => loaderData?.head ?? {},
  notFoundComponent: () => (
    <SiteLayout>
      <SiteNotFound />
    </SiteLayout>
  ),
  component: ArticlePage,
});

function ArticlePage() {
  const { slug } = Route.useParams();
  const article = articleBySlug(slug)!;
  const task = TASKS.find((item) => item.path === article.task);
  const related = ARTICLES.filter((item) => item.slug !== slug).slice(0, 3);
  return (
    <SiteLayout>
      <ReadingProgress />
      <Breadcrumbs
        items={[
          { name: "Главная", to: "/" },
          { name: ARTICLES_PAGE.eyebrow, to: "/stati" },
          { name: article.title },
        ]}
      />
      <article aria-labelledby="article-title">
        <header data-hero className="site-page-hero bg-void">
          <HeroBackdrop />
          <div className="site-wrap site-page-head">
            <div className="flex flex-wrap items-center gap-3 text-meta text-text-3">
              <span className="site-chip-grad">{article.topic}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {ARTICLES_PAGE.minutes(readingMinutes(article))}
              </span>
            </div>
            <h1 id="article-title" className="site-h1 mt-5 max-w-[22ch] text-text">
              {article.title}
            </h1>
            <p className="site-lead mt-4 max-w-[640px] text-text-2 lg:mt-6">{article.lead}</p>
          </div>
        </header>
        <div className="site-wrap pb-16 lg:pb-24">
          <div className="site-article">
            {article.body.map((block, index) => {
              switch (block.kind) {
                case "h2":
                  return (
                    <h2 key={index} className="site-h2 text-text">
                      {block.text}
                    </h2>
                  );
                case "list":
                  return (
                    <ul key={index} className="mt-4 flex flex-col gap-3">
                      {block.items.map((item) => (
                        <li key={item} className="site-body flex gap-3 text-text-2">
                          <span
                            aria-hidden
                            className="mt-2.5 size-1.5 shrink-0 rounded-full bg-text-3"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                case "note":
                  return (
                    <aside key={index} className="site-article-note">
                      <p className="site-caption font-medium text-text-3">{ARTICLES_PAGE.task}</p>
                      <p className="site-body mt-1 text-text">{block.text}</p>
                      {task ? (
                        <Link
                          to={task.path}
                          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-body-strong text-text focus-ring"
                        >
                          {task.title}
                          <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      ) : null}
                    </aside>
                  );
                default:
                  return (
                    <p key={index} className="site-body mt-4 text-text-2">
                      {block.text}
                    </p>
                  );
              }
            })}
            <Link to="/stati" className={cn(siteButton.secondary, "site-btn-sm mt-10")}>
              <ArrowLeft className="size-4" aria-hidden />
              {ARTICLES_PAGE.back}
            </Link>
          </div>
        </div>
      </article>
      <section aria-labelledby="related-title" className="site-block bg-surface">
        <div className="site-wrap">
          <h2 id="related-title" className="site-h2 text-text">
            {ARTICLES_PAGE.related}
          </h2>
          <ArticleGrid items={related} className="site-block-body" />
        </div>
      </section>
      <LeadSection source="article" />
      <StickyCta from="article" />
    </SiteLayout>
  );
}
