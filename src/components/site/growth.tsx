import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Monitor, Smartphone } from "lucide-react";
import {
  ARTICLES,
  ARTICLES_PAGE,
  AUDIENCE,
  HOW_IT_WORKS,
  readingMinutes,
  ROLES,
  type Article,
} from "@/lib/site/pages";
import { track } from "@/lib/site/analytics";
import { cn } from "@/lib/utils";

/**
 * Блоки роста сайта (ADR-068): бегущая строка возможностей, карточки ролей, цепочка записи,
 * карточки статей, полоса прочитанного. Всё в разметке сервера, скрипт только оживляет.
 */

/** Возможности из docs/site/CAPABILITIES.md: только то, что есть в демо или пилоте */
const CAPABILITIES = [
  "Время бригады с телефона",
  "Повтор вчерашней записи в 2 касания",
  "Пересечения и дубли сразу",
  "Приём записей пачкой",
  "Правка с причиной и историей",
  "Неделя закрывается версией",
  "Excel в структуре вашего отчёта",
  "Выработка по смете на час",
  "Заявка на материал текстом",
  "Сверка с лимитом сметы",
  "Приёмка с фото накладной",
  "Черновики АОСР в docx",
  "Реестр ИД в Excel",
  "Чего не хватает и кто отвечает",
] as const;

export function CapabilityMarquee() {
  // Две копии подряд: дорожка сдвигается на половину и бесшовно повторяется
  return (
    <div className="site-marquee py-6" aria-label="Что умеет ГАЙКА">
      <ul className="site-marquee-track">
        {[...CAPABILITIES, ...CAPABILITIES].map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="site-marquee-item"
            aria-hidden={index >= CAPABILITIES.length || undefined}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current opacity-50" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const whereIcon = (where: string) => (where === "Компьютер" ? Monitor : Smartphone);

/** Карточки пяти ролей на главной: боль, что стало, ссылка на подробности */
export function RoleCards() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-reveal-group>
      {ROLES.map((role) => {
        const Icon = whereIcon(role.where);
        return (
          <li key={role.key} className="site-glow-card flex flex-col p-6 lg:p-7" data-reveal>
            <div className="flex items-center justify-between gap-3">
              <h3 className="site-h3 text-text">{role.title}</h3>
              <span className="inline-flex items-center gap-1.5 text-meta text-text-3">
                <Icon className="size-4" aria-hidden />
                {role.where}
              </span>
            </div>
            <p className="site-body mt-4 text-text-3">{role.pain}</p>
            <p className="site-body mt-2 font-medium text-text">{role.gain}</p>
            <Link
              to="/dlya-kogo"
              hash={role.key}
              onClick={() => track("role_card_click", { role: role.key })}
              className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-4 text-body-strong text-text focus-ring"
            >
              {AUDIENCE.more}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Цепочка записи: пять шагов от сообщения до отчёта */
export function RecordChain() {
  return (
    <ol className="site-chain" data-reveal-group>
      {HOW_IT_WORKS.chain.map((step, index) => (
        <li key={step.title} className="site-glow-card flex gap-4 p-5 lg:flex-col" data-reveal>
          <span className="site-step-num" aria-hidden>
            {index + 1}
          </span>
          <div>
            <p className="site-h3 text-text">{step.title}</p>
            <p className="site-body mt-1 text-text-2">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ArticleCard({ article }: { article: Article }) {
  return (
    <li className="site-glow-card group relative flex flex-col p-6 lg:p-7" data-reveal>
      <div className="flex items-center gap-3 text-meta text-text-3">
        <span className="site-chip-grad">{article.topic}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {ARTICLES_PAGE.minutes(readingMinutes(article))}
        </span>
      </div>
      <h3 className="site-h3 mt-4 text-text">
        <Link
          to="/stati/$slug"
          params={{ slug: article.slug }}
          onClick={() => track("article_click", { slug: article.slug })}
          className="site-card-link focus-ring"
        >
          {article.title}
        </Link>
      </h3>
      <p className="site-body mt-2 text-text-2">{article.description}</p>
      <span
        aria-hidden
        className="mt-auto inline-flex items-center gap-1.5 pt-4 text-body-strong text-text"
      >
        {ARTICLES_PAGE.read}
        <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-1" />
      </span>
    </li>
  );
}

export function ArticleGrid({
  items,
  className,
}: {
  items: readonly Article[];
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", className)} data-reveal-group>
      {items.map((article) => (
        <ArticleCard key={article.slug} article={article} />
      ))}
    </ul>
  );
}

/** Три свежие статьи для главной */
export const LATEST_ARTICLES = ARTICLES.slice(0, 3);

/** Полоса прочитанного: доля прокрутки статьи в переменной --progress */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      aria-hidden
      className="site-progress"
      style={{ "--progress": progress } as CSSProperties}
    />
  );
}

/** Свет и сетка за первым экраном: декорация, без текста */
export function HeroBackdrop() {
  return (
    <>
      <div className="site-grid-bg" aria-hidden />
      <div className="site-aurora" aria-hidden>
        <i />
      </div>
    </>
  );
}
