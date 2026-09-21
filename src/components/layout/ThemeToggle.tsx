import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp } from "@/lib/app-context";
import { themeChoices, themeLabels, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const icons: Record<ThemeChoice, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

/**
 * Переключатель темы на три положения (ADR-017, п. 5). Выбор запоминается в браузере,
 * «как в системе» слушает настройку системы и меняет тему на лету.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { themeChoice, setThemeChoice } = useApp();
  const Icon = icons[themeChoice];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Тема оформления: ${themeLabels[themeChoice].toLowerCase()}. Сменить`}
          title={`Тема: ${themeLabels[themeChoice].toLowerCase()}`}
          className={cn("icon-button focus-ring", className)}
        >
          <Icon strokeWidth={1.5} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel className="text-[12px] font-normal text-text-3">
          Тема оформления
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={themeChoice}
          onValueChange={(value) => setThemeChoice(value as ThemeChoice)}
        >
          {themeChoices.map((choice) => {
            const ChoiceIcon = icons[choice];
            return (
              <DropdownMenuRadioItem key={choice} value={choice} className="gap-2">
                <ChoiceIcon className="size-4 shrink-0 text-text-3" strokeWidth={1.5} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px]">{themeLabels[choice]}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
