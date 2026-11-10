import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { NOT_FOUND, TASKS } from "@/lib/site/copy";
import { SiteLayout } from "./SiteLayout";
import { siteButton, SitePageHead } from "./parts";

/**
 * Страница 404 сайта (ADR-067, раздел 6.4): коротко, три задачи и «На главную».
 * Статус ответа 404 ставит маршрутизатор: адрес не нашёлся
 */
export function SiteNotFound() {
  return (
    <SiteLayout>
      <SitePageHead title={NOT_FOUND.title} lead={NOT_FOUND.lead} className="site-page-head" />
      <div className="site-wrap pb-20 lg:pb-32">
        <ul className="grid gap-4 md:grid-cols-3">
          {TASKS.map((task) => (
            <li key={task.key}>
              <Link
                to={task.path}
                className="flex min-h-full flex-col gap-2 rounded-card bg-surface p-6 focus-ring"
              >
                <span className="site-h3 text-text">{task.title}</span>
                <span className="site-body text-text-2">{task.short}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/" className={`${siteButton.primary} mt-8`}>
          {NOT_FOUND.home}
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      </div>
    </SiteLayout>
  );
}
