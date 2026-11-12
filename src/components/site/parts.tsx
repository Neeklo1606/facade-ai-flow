import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Кирпичи публичного сайта (01_SPEC 5, ADR-067): кнопки-капсулы, шапка страницы, секция,
 * статус готовности, хлебная строка. Ссылки остаются ссылками (`<a>` или `Link`),
 * кнопкой их делает только вид.
 */
export const siteButton = {
  /** Главное действие экрана: одно на экран, чёрная таблетка «Монохрома» (ADR-055, ADR-059) */
  primary: "site-btn mono-btn-primary focus-ring",
  /** Второе действие: тихая капсула с обводкой */
  /** Главное действие первого экрана с градиентом (ADR-068): одно на страницу */
  grad: "site-btn site-btn-grad focus-ring",
  secondary:
    "site-btn bg-surface text-text ring-1 ring-line-2 ring-inset focus-ring is-hover:bg-surface-2",
};

/** Шапка страницы сайта: метка, H1, вводная строка */
export function SitePageHead({
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("site-wrap site-page-head", className)}>
      {eyebrow ? <div className="site-caption mb-4 font-medium text-text-2">{eyebrow}</div> : null}
      <h1 className="site-h1 max-w-[18ch] text-text">{title}</h1>
      {lead ? <p className="site-lead mt-4 max-w-[640px] text-text-2 lg:mt-6">{lead}</p> : null}
      {children}
    </header>
  );
}

/**
 * Секция сайта (раздел 10): заголовок H2 с aria-labelledby, воздух вместо линий, фон
 * чередуется холстом и карточкой
 */
export function SiteSection({
  id,
  title,
  lead,
  tone = "canvas",
  children,
  className,
  headingClassName,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  tone?: "canvas" | "card";
  children: ReactNode;
  className?: string;
  headingClassName?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("site-block", tone === "card" ? "bg-surface" : "bg-void", className)}
    >
      <div className="site-wrap">
        <div data-reveal-group className={cn("max-w-[760px]", headingClassName)}>
          <h2 id={`${id}-title`} className="site-h2 text-text" data-reveal>
            {title}
          </h2>
          {lead ? (
            <div className="site-body mt-3 max-w-[640px] text-text-2" data-reveal>
              {lead}
            </div>
          ) : null}
        </div>
        <div className="site-block-body">{children}</div>
      </div>
    </section>
  );
}

/** Статус готовности: точка и слово, не только цвет (раздел 10) */
export function StatusBadge({
  kind,
  text,
  className,
}: {
  kind: "live" | "demo";
  text: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-meta text-text",
        className,
      )}
      data-readiness={kind}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", kind === "live" ? "bg-ok" : "bg-text-3")}
      />
      {text}
    </span>
  );
}

/** Хлебная строка «Главная · Задачи · <название>» (раздел 6, шаблон 1) */
export function Breadcrumbs({ items }: { items: readonly { name: string; to?: string }[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="site-wrap pt-4">
      <ol className="flex flex-wrap items-center gap-1 text-meta text-text-3">
        {items.map((item, index) => (
          <li key={item.name} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3.5" aria-hidden /> : null}
            {item.to ? (
              <Link
                to={item.to}
                className="inline-flex min-h-11 items-center focus-ring is-hover:text-text"
              >
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-text-2">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Загрузка блока сайта скелетом (ADR-045, 4.17; шаг L8): серые плашки по форме будущих
 * карточек, без спиннеров. reduced-motion гасит пульсацию в CSS
 */
export function SiteSkeleton({ blocks = 2, label }: { blocks?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: blocks }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="flex flex-col gap-3 rounded-2xl bg-surface p-6 ring-1 ring-line motion-safe:animate-pulse"
        >
          <span className="h-5 w-2/5 rounded-full bg-surface-2" />
          <span className="h-4 w-4/5 rounded-full bg-surface-2" />
          <span className="h-4 w-3/5 rounded-full bg-surface-2" />
          <span className="mt-3 h-12 w-48 rounded-full bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

/** Ошибка блока сайта: что случилось и «Повторить», без извинений */
export function SiteError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-4 rounded-2xl bg-surface p-6 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="site-body text-text">{what}</p>
      <button type="button" onClick={onRetry} className={siteButton.secondary}>
        Повторить
      </button>
    </div>
  );
}
