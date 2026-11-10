import { CASE, DEMO, KIT, LANDING, PRIVACY, RAZBOR, TASKS } from "./copy";
import { faqLd, siteHead, softwareLd } from "./head";
import { taskHead } from "./task-head";

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
  | "/kit";

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
