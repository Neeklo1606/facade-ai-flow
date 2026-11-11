import { CASE, DEMO, KIT, LANDING, PRIVACY, RAZBOR, TASKS } from "./copy";
import { absoluteUrl, breadcrumbLd, faqLd, siteHead, softwareLd } from "./head";
import { taskHead } from "./task-head";
import { ARTICLES_PAGE, AUDIENCE, HOW_IT_WORKS, articleBySlug } from "./pages";

/**
 * Мета каждой страницы сайта (ADR-067, раздел 9.4). Модуль грузится загрузчиком маршрута
 * динамическим импортом: тексты сайта не едут в первый кусок приложения (ADR-013, порог
 * бандла). На сервере мета готова до HTML, во вкладке приходит вместе с данными маршрута.
 */
export type SitePage =
  | "/"
  | "/uchet-vremeni-brigad"
  | "/snabzhenie"
  | "/ispolnitelnaya-dokumentatsiya"
  | "/demo"
  | "/case/gas"
  | "/razbor"
  | "/privacy"
  | "/kit"
  | "/dlya-kogo"
  | "/kak-rabotaet"
  | "/stati";

const TASK_IMAGE: Record<string, string> = {
  time: "/og/task-time.jpg",
  supply: "/og/task-supply.jpg",
  docs: "/og/task-docs.jpg",
};

export function headFor(path: SitePage) {
  const task = TASKS.find((item) => item.path === path);
  if (task) return taskHead(task, TASK_IMAGE[task.key]!);
  switch (path) {
    case "/demo":
      return siteHead({ path, ...DEMO.meta, image: "/og/demo.jpg" });
    case "/case/gas":
      return siteHead({ path, ...CASE.meta, image: "/og/case.jpg" });
    case "/razbor":
      return siteHead({ path, ...RAZBOR.meta, image: "/og/razbor.jpg" });
    case "/privacy":
      return siteHead({ path, ...PRIVACY.meta });
    case "/kit":
      return siteHead({ path, ...KIT.meta });
    case "/dlya-kogo":
      return siteHead({ path, ...AUDIENCE.meta, image: "/og/landing.jpg" });
    case "/kak-rabotaet":
      return siteHead({
        path,
        ...HOW_IT_WORKS.meta,
        image: "/og/landing.jpg",
        jsonLd: [faqLd(HOW_IT_WORKS.faq)],
      });
    case "/stati":
      return siteHead({ path, ...ARTICLES_PAGE.meta, image: "/og/landing.jpg" });
    default:
      return siteHead({
        path: "/",
        ...LANDING.meta,
        image: "/og/landing.jpg",
        jsonLd: [
          softwareLd({ name: "ГАЙКА", description: LANDING.meta.description, path: "/" }),
          faqLd(LANDING.faq.items),
        ],
      });
  }
}

export type SiteHeadData = ReturnType<typeof headFor>;

/** Мета статьи: заголовок, описание, Article и крошки в JSON-LD. Нет такой статьи: null */
export function articleHeadFor(slug: string) {
  const article = articleBySlug(slug);
  if (!article) return null;
  const path = `/stati/${article.slug}`;
  return siteHead({
    path,
    // Заголовок до 60 знаков: длинным статьям приписка «· ГАЙКА» не помещается
    title: article.title.length <= 52 ? `${article.title} · ГАЙКА` : article.title,
    description: article.description,
    image: "/og/landing.jpg",
    jsonLd: [
      {
        "@type": "Article",
        headline: article.title,
        description: article.description,
        datePublished: article.date,
        inLanguage: "ru",
        mainEntityOfPage: absoluteUrl(path),
        author: { "@type": "Organization", name: "ГАЙКА" },
      },
      breadcrumbLd([
        { name: "Главная", path: "/" },
        { name: ARTICLES_PAGE.eyebrow, path: "/stati" },
        { name: article.title, path },
      ]),
    ],
  });
}
