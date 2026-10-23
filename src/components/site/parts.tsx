import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Кирпичи публичного сайта (01_SPEC 5): кнопки-капсулы и шапка страницы.
 * Ссылки остаются ссылками (`<a>` или `Link`), кнопкой их делает только вид.
 */
export const siteButton = {
  /** Главное действие экрана: одно на экран, оранжевое */
  primary:
    "site-btn bg-orange-strong text-on-orange focus-ring is-hover:bg-[var(--orange-strong-hover)]",
  /** Второе действие: тихая капсула с обводкой */
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
  eyebrow?: string | undefined;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("site-wrap pt-10 pb-12 lg:pt-20 lg:pb-16", className)}>
      {eyebrow ? <p className="site-caption mb-4 font-medium text-text-2">{eyebrow}</p> : null}
      <h1 className="site-h1 max-w-[16ch] text-text">{title}</h1>
      {lead ? <p className="site-lead mt-4 max-w-[640px] text-text-2 lg:mt-6">{lead}</p> : null}
      {children}
    </header>
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
