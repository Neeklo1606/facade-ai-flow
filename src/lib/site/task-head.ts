import { CRUMBS, type TaskCopy } from "./copy";
import { breadcrumbLd, faqLd, siteHead, softwareLd } from "./head";

/** Мета страницы задачи (ADR-067, раздел 9): title, описание, превью и JSON-LD */
export function taskHead(task: TaskCopy, image: string) {
  return siteHead({
    path: task.path,
    title: task.meta.title,
    description: task.meta.description,
    image,
    jsonLd: [
      softwareLd({
        name: `ГАЙКА: ${task.title.toLowerCase()}`,
        description: task.meta.description,
        path: task.path,
      }),
      faqLd(task.faq),
      breadcrumbLd([
        { name: CRUMBS.home, path: "/" },
        { name: task.title, path: task.path },
      ]),
    ],
  });
}
