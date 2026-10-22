import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { articleForScreen } from "@/lib/help/articles";

/**
 * Ссылка на статью справки в подсказке экрана. Отдельным куском: статьи справки нужны,
 * только когда подсказку открыли, и в первую загрузку не едут (порог бандла, L1)
 */
export default function ScreenHelpArticle({ screen }: { screen: string }) {
  const article = articleForScreen(screen);
  if (!article) return null;
  return (
    <Link
      to="/help"
      search={{ article: article.id }}
      className="text-meta-strong focus-ring mt-3 inline-flex min-h-12 items-center gap-1.5 rounded-[var(--r-xs)] font-medium text-text-2 transition-fast is-hover:text-text lg:min-h-0"
    >
      {article.title} — в справке
      <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
    </Link>
  );
}
