import { lazy, Suspense } from "react";
import { useRouterState } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { screenFor } from "@/lib/guide/screens";

// Статьи справки грузятся при открытии подсказки, а не с первым экраном
const ScreenHelpArticle = lazy(() => import("./ScreenHelpArticle"));

/**
 * Подсказка экрана в шапке (ADR-010): три предложения — что это за экран, на какой вопрос
 * он отвечает, что делать дальше. Текст берётся из общего словаря экранов.
 */
export function ScreenHelp() {
  const location = useRouterState({ select: (s) => s.location });
  const screen = screenFor(location.pathname, location.searchStr);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Что это за экран: ${screen.name}`}
          className="icon-button focus-ring shrink-0"
        >
          <HelpCircle strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(340px,calc(100vw-32px))] p-4">
        <p className="text-meta-strong font-medium text-text">{screen.name}</p>
        <ul className="text-meta mt-2 flex flex-col gap-1.5 text-text-2">
          {screen.help.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
        {/* Подсказка отвечает «что это за экран», статья — «как этим пользоваться» (ADR-019, п. 5) */}
        <Suspense fallback={null}>
          <ScreenHelpArticle screen={screen.key} />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
