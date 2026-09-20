import { useRouterState } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { screenFor } from "@/lib/guide/screens";

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
        <p className="text-[13px] leading-[1.4] font-medium text-text">{screen.name}</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-[1.45] text-text-2">
          {screen.help.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
